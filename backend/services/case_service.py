"""Case service for managing PA cases."""
from typing import Dict, Any, List, Optional
from datetime import datetime, date, timezone, timedelta
from enum import Enum
import json

from sqlalchemy.ext.asyncio import AsyncSession


def serialize_for_json(obj: Any) -> Any:
    """
    Recursively serialize an object for JSON storage.
    Handles datetime, date, and nested structures.
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, date):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {k: serialize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [serialize_for_json(item) for item in obj]
    elif isinstance(obj, Enum):
        return obj.value
    elif hasattr(obj, 'model_dump'):  # Pydantic model
        return serialize_for_json(obj.model_dump())
    elif hasattr(obj, '__dict__'):  # Generic object
        return serialize_for_json(obj.__dict__)
    return obj

from backend.models.case_state import CaseState, HumanDecision
from backend.models.enums import CaseStage, EventType, HumanDecisionAction
from backend.storage.case_repository import CaseRepository
from backend.storage.audit_logger import AuditLogger
from backend.storage.waypoint_writer import get_waypoint_writer
from backend.agents.intake_agent import get_intake_agent
from backend.agents.policy_analyzer import get_policy_analyzer
from backend.agents.strategy_generator import get_strategy_generator
from backend.orchestrator.case_orchestrator import get_case_orchestrator
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


def _derive_payers_from_patient(case_state: CaseState) -> list[str]:
    """Derive payer list from payer_states, falling back to patient data fields."""
    if case_state.payer_states:
        return list(case_state.payer_states.keys())
    payers = []
    if case_state.patient and case_state.patient.primary_payer:
        payers.append(case_state.patient.primary_payer)
    if case_state.patient and case_state.patient.secondary_payer:
        payers.append(case_state.patient.secondary_payer)
    if payers:
        logger.warning("Derived payers from patient data (payer_states empty)",
                       case_id=case_state.case_id, payers=payers)
    return payers


class CaseService:
    """
    Service for managing prior authorization cases.
    Provides high-level operations for case lifecycle.
    """

    def __init__(self, session: AsyncSession, write_waypoints: bool = True):
        """
        Initialize case service with database session.

        Args:
            session: SQLAlchemy async session
            write_waypoints: Whether to write waypoint files (default True)
        """
        self.session = session
        self.repository = CaseRepository(session)
        self.audit_logger = AuditLogger(session)
        self.write_waypoints = write_waypoints
        self.waypoint_writer = get_waypoint_writer() if write_waypoints else None
        logger.info("Case service initialized", waypoints=write_waypoints)

    async def create_case(self, patient_id: str) -> Dict[str, Any]:
        """
        Create a new PA case for a patient.

        Args:
            patient_id: Patient identifier

        Returns:
            Created case data
        """
        logger.info("Creating case", patient_id=patient_id)

        # Process intake
        intake_agent = get_intake_agent()
        case_state = await intake_agent.process_intake(patient_id)

        # Store in database
        case_model = await self.repository.create(case_state)

        # Log audit event
        await self.audit_logger.log_case_created(
            case_id=case_state.case_id,
            patient_id=patient_id,
            medication_name=case_state.medication.medication_name if case_state.medication else "Unknown"
        )

        logger.info("Case created", case_id=case_state.case_id)

        return case_model.to_dict()

    async def get_case(self, case_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a case by ID.

        Args:
            case_id: Case identifier

        Returns:
            Case data or None
        """
        case = await self.repository.get_by_id(case_id)
        if case:
            return case.to_dict()
        return None

    async def get_case_state(self, case_id: str) -> Optional[CaseState]:
        """
        Get a case as a CaseState domain object.

        Args:
            case_id: Case identifier

        Returns:
            CaseState or None
        """
        case = await self.repository.get_by_id(case_id)
        if case:
            return self.repository.to_case_state(case)
        return None

    async def list_cases(
        self,
        stage: Optional[CaseStage] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List cases with optional filtering.

        Args:
            stage: Filter by stage
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of case data
        """
        cases = await self.repository.get_all(stage=stage, limit=limit, offset=offset)
        return [c.to_dict() for c in cases]

    async def count_cases(self, stage: Optional[CaseStage] = None) -> int:
        """
        Count total cases with optional stage filter.

        Args:
            stage: Optional stage filter

        Returns:
            Total count of matching cases
        """
        return await self.repository.count(stage=stage)

    async def process_case(self, case_id: str) -> Dict[str, Any]:
        """
        Process a case through the full workflow.

        Args:
            case_id: Case identifier

        Returns:
            Final case state
        """
        logger.info("Processing case", case_id=case_id)

        # Get current case
        case = await self.repository.get_by_id(case_id)
        if not case:
            raise ValueError(f"Case not found: {case_id}")

        case_state = self.repository.to_case_state(case)

        # Load patient data
        intake_agent = get_intake_agent()
        patient_data = await intake_agent.load_patient_data(case_state.patient.patient_id)

        medication_data = {
            "medication_request": {
                "medication_name": case_state.medication.medication_name,
                "generic_name": case_state.medication.generic_name,
                "ndc_code": case_state.medication.ndc_code,
                "dose": case_state.medication.dose,
                "frequency": case_state.medication.frequency,
                "route": case_state.medication.route,
                "duration": case_state.medication.duration,
                "diagnosis": case_state.medication.diagnosis,
                "icd10_code": case_state.medication.icd10_code,
                "prescriber_npi": case_state.medication.prescriber_npi,
                "prescriber_name": case_state.medication.prescriber_name,
                "clinical_rationale": case_state.medication.clinical_rationale,
            }
        }

        # Run through orchestrator
        orchestrator = get_case_orchestrator()
        final_state = await orchestrator.process_case(
            case_id=case_id,
            patient_id=case_state.patient.patient_id,
            patient_data=patient_data,
            medication_data=medication_data,
            payers=_derive_payers_from_patient(case_state)
        )

        # Serialize all data for JSON storage
        stage_value = final_state.get("stage", CaseStage.COMPLETED)
        if hasattr(stage_value, 'value'):
            stage_value = stage_value.value

        # Update database
        await self.repository.update(
            case_id=case_id,
            updates={
                "stage": stage_value,
                "coverage_assessments": serialize_for_json(final_state.get("coverage_assessments", {})),
                "documentation_gaps": serialize_for_json(final_state.get("documentation_gaps", [])),
                "available_strategies": serialize_for_json(final_state.get("available_strategies", [])),
                "selected_strategy_id": (final_state.get("selected_strategy") or {}).get("strategy_id"),
                "strategy_rationale": final_state.get("strategy_rationale"),
                "payer_states": serialize_for_json(final_state.get("payer_states", {})),
                "completed_actions": serialize_for_json(final_state.get("completed_actions", [])),
                "error_message": final_state.get("error")
            },
            change_description="Case processed through workflow"
        )

        # Log completion
        await self.audit_logger.log_stage_change(
            case_id=case_id,
            from_stage=case_state.stage.value,
            to_stage=stage_value,
            reason=final_state.get("final_outcome") or "Processing complete"
        )

        # Get updated case
        updated_case = await self.repository.get_by_id(case_id)
        return updated_case.to_dict() if updated_case else {}

    async def analyze_policies(self, case_id: str) -> Dict[str, Any]:
        """
        Run policy analysis for a case.

        Args:
            case_id: Case identifier

        Returns:
            Analysis results
        """
        logger.info("Analyzing policies", case_id=case_id)

        case_state = await self.get_case_state(case_id)
        if not case_state:
            raise ValueError(f"Case not found: {case_id}")

        analyzer = get_policy_analyzer()
        assessments = await analyzer.analyze_all_payers(case_state)

        # Convert to dict for storage
        assessment_dicts = {
            payer: assessment.model_dump()
            for payer, assessment in assessments.items()
        }

        # Get comparison
        comparison = analyzer.compare_assessments(assessments)

        # Get all gaps
        gaps = analyzer.get_all_documentation_gaps(assessments)

        # Update case
        await self.repository.update(
            case_id=case_id,
            updates={
                "stage": CaseStage.POLICY_ANALYSIS.value,
                "coverage_assessments": assessment_dicts,
                "documentation_gaps": gaps
            },
            change_description="Policy analysis completed"
        )

        # Log audit event
        await self.audit_logger.log_event(
            case_id=case_id,
            event_type=EventType.POLICY_ANALYZED,
            decision_made=f"Analyzed {len(assessments)} payer policies",
            reasoning=f"Best payer: {comparison.get('best_payer')} with {comparison.get('best_likelihood', 0):.0%} likelihood",
            stage=CaseStage.POLICY_ANALYSIS.value,
            input_data={"payers_analyzed": list(assessments.keys())}
        )

        return {
            "assessments": assessment_dicts,
            "comparison": comparison,
            "documentation_gaps": gaps
        }

    async def generate_strategies(self, case_id: str) -> Dict[str, Any]:
        """
        Generate and score strategies for a case.

        Args:
            case_id: Case identifier

        Returns:
            Strategies and scores
        """
        logger.info("Generating strategies", case_id=case_id)

        case_state = await self.get_case_state(case_id)
        if not case_state:
            raise ValueError(f"Case not found: {case_id}")

        generator = get_strategy_generator()
        best_strategy, all_scores, rationale = await generator.select_best_strategy(case_state)

        # Store strategies
        strategy_dicts = [
            s.model_dump() for s in await generator.generate_strategies(case_state)
        ]
        score_dicts = [s.model_dump() for s in all_scores]

        # Update case
        await self.repository.update(
            case_id=case_id,
            updates={
                "stage": CaseStage.STRATEGY_SELECTION.value,
                "available_strategies": strategy_dicts,
                "selected_strategy_id": best_strategy.strategy_id,
                "strategy_rationale": rationale
            },
            change_description="Strategies generated and scored"
        )

        # Log audit event
        await self.audit_logger.log_strategy_selected(
            case_id=case_id,
            selected_strategy=best_strategy.model_dump(),
            all_scores=score_dicts,
            reasoning=rationale
        )

        return {
            "strategies": strategy_dicts,
            "scores": score_dicts,
            "selected": best_strategy.model_dump(),
            "rationale": rationale
        }

    async def get_audit_trail(self, case_id: str) -> Dict[str, Any]:
        """
        Get the complete audit trail for a case.

        Args:
            case_id: Case identifier

        Returns:
            Audit trail data
        """
        trail = await self.audit_logger.get_audit_trail(case_id)
        return trail.to_dict()

    async def delete_case(self, case_id: str) -> bool:
        """
        Delete a case.

        Args:
            case_id: Case identifier

        Returns:
            True if deleted
        """
        return await self.repository.delete(case_id)

    async def reset_case(self, case_id: str) -> Optional[Dict[str, Any]]:
        """
        Reset a case to initial intake state for demo re-runs.

        Args:
            case_id: Case identifier

        Returns:
            Reset case data, or None if not found
        """
        case = await self.repository.reset(case_id)
        if not case:
            return None

        # Log audit event for the reset (fresh chain start)
        await self.audit_logger.log_event(
            case_id=case_id,
            event_type=EventType.CASE_CREATED,
            decision_made="Case reset to intake for demo re-run",
            reasoning="User-initiated reset — all prior analysis, strategies, and decisions cleared",
            stage="intake",
            input_data={"action": "reset"},
            actor="user",
        )

        logger.info("Case reset", case_id=case_id)
        return case.to_dict()

    async def run_stage(self, case_id: str, stage: str, refresh: bool = False) -> Dict[str, Any]:
        """
        Run a single workflow stage and return agent analysis.

        This supports human-in-the-loop by running only one stage
        and returning detailed reasoning for human review.

        Args:
            case_id: Case identifier
            stage: Stage to run
            refresh: If False, return cached results when available (default).
                     If True, force a fresh LLM call even if results exist.

        Returns:
            Stage analysis with reasoning, findings, and recommendations
        """
        logger.info("Running single stage", case_id=case_id, stage=stage, refresh=refresh)

        case_state = await self.get_case_state(case_id)
        if not case_state:
            raise ValueError(f"Case not found: {case_id}")

        # Build analysis result based on stage
        if stage == "policy_analysis":
            return await self._run_policy_analysis_stage(case_state, refresh=refresh)
        elif stage == "cohort_analysis":
            return await self._run_cohort_analysis_stage(case_state)
        elif stage == "ai_recommendation":
            return await self._run_ai_recommendation_stage(case_state)
        elif stage == "strategy_generation":
            return await self._run_strategy_generation_stage(case_state)
        elif stage == "action_coordination":
            return await self._run_action_coordination_stage(case_state)
        elif stage == "monitoring":
            return await self._run_monitoring_stage(case_state)
        else:
            raise ValueError(f"Unknown stage: {stage}")

    async def _run_policy_analysis_stage(self, case_state, refresh: bool = False) -> Dict[str, Any]:
        """Run policy analysis and return agent reasoning.

        Args:
            case_state: Current case state
            refresh: If True, force fresh LLM call. If False, return cached results.
        """
        from backend.reasoning.policy_reasoner import get_policy_reasoner

        # Return cached results if available and refresh not requested
        if not refresh and case_state.coverage_assessments:
            cached_assessments = case_state.coverage_assessments
            # Ensure we have actual data (not empty dict)
            if isinstance(cached_assessments, dict) and any(cached_assessments.values()):
                logger.info(
                    "Returning cached policy analysis",
                    case_id=case_state.case_id,
                    payers=list(cached_assessments.keys()),
                )
                # Reconstruct the same response shape from cached data
                payers = list(cached_assessments.keys())
                findings = []
                all_gaps = []
                for payer, assessment_data in cached_assessments.items():
                    if isinstance(assessment_data, dict):
                        likelihood = assessment_data.get("approval_likelihood", 0)
                        met = assessment_data.get("criteria_met_count", 0)
                        total = assessment_data.get("criteria_total_count", 0)
                        not_met = total - met
                    else:
                        likelihood = getattr(assessment_data, 'approval_likelihood', 0)
                        met = getattr(assessment_data, 'criteria_met_count', 0)
                        total = getattr(assessment_data, 'criteria_total_count', 0)
                        not_met = total - met

                    status = "positive" if likelihood > 0.7 else "warning" if likelihood > 0.4 else "negative"
                    findings.append({
                        "title": f"{payer} Coverage Assessment",
                        "detail": f"Approval likelihood: {likelihood:.0%}. {met} criteria met, {not_met} not met.",
                        "status": status,
                    })

                # Collect cached documentation gaps
                cached_gaps = case_state.documentation_gaps or []
                for gap in cached_gaps:
                    if isinstance(gap, dict):
                        all_gaps.append(gap)
                    elif hasattr(gap, 'model_dump'):
                        all_gaps.append(gap.model_dump())

                best_payer = max(payers, key=lambda p: (
                    cached_assessments[p].get("approval_likelihood", 0)
                    if isinstance(cached_assessments[p], dict)
                    else getattr(cached_assessments[p], 'approval_likelihood', 0)
                ))
                best_likelihood = (
                    cached_assessments[best_payer].get("approval_likelihood", 0)
                    if isinstance(cached_assessments[best_payer], dict)
                    else getattr(cached_assessments[best_payer], 'approval_likelihood', 0)
                )

                reasoning = f"I analyzed coverage policies for {len(payers)} payers. "
                reasoning += f"{best_payer} shows the highest approval likelihood at {best_likelihood:.0%}. "
                if all_gaps:
                    reasoning += f"I identified {len(all_gaps)} documentation gaps that should be addressed. "

                recommendations = []
                if best_likelihood > 0.7:
                    recommendations.append(f"Proceed with {best_payer} as primary target - high confidence")
                else:
                    recommendations.append("Consider gathering additional documentation before submission")
                if all_gaps:
                    recommendations.append(f"Address {len(all_gaps)} documentation gaps to improve approval chances")

                # Reconstruct confidence details from cached assessment data
                cached_criterion_confidences = []
                cached_low_conf = []
                for _p, _ad in cached_assessments.items():
                    criteria_list = (
                        _ad.get("criteria_assessments", []) if isinstance(_ad, dict)
                        else getattr(_ad, "criteria_assessments", [])
                    )
                    for _c in criteria_list:
                        _c_conf = _c.get("confidence", 0) if isinstance(_c, dict) else getattr(_c, "confidence", 0)
                        cached_criterion_confidences.append(_c_conf)
                        if _c_conf < 0.7:
                            cached_low_conf.append({
                                "payer": _p,
                                "criterion": _c.get("criterion_name", "") if isinstance(_c, dict) else getattr(_c, "criterion_name", ""),
                                "confidence": _c_conf,
                                "reasoning": _c.get("reasoning", "") if isinstance(_c, dict) else getattr(_c, "reasoning", ""),
                            })

                return {
                    "stage": "policy_analysis",
                    "reasoning": reasoning,
                    "confidence": best_likelihood,
                    "findings": findings,
                    "recommendations": recommendations,
                    "warnings": [f"Documentation gap: {gap.get('description', gap) if isinstance(gap, dict) else gap}" for gap in all_gaps[:3]] if all_gaps else [],
                    "assessments": serialize_for_json(cached_assessments),
                    "documentation_gaps": all_gaps,
                    "provenance": {
                        "is_cached": True,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                    "reasoning_chains": {},
                    "confidence_details": {
                        "aggregate": {
                            "min": round(min(cached_criterion_confidences), 3) if cached_criterion_confidences else 0.0,
                            "mean": round(sum(cached_criterion_confidences) / len(cached_criterion_confidences), 3) if cached_criterion_confidences else 0.0,
                            "max": round(max(cached_criterion_confidences), 3) if cached_criterion_confidences else 0.0,
                        },
                        "low_confidence_criteria": cached_low_conf,
                    },
                }

        reasoner = get_policy_reasoner()
        payers = _derive_payers_from_patient(case_state)

        if not payers:
            raise ValueError(
                f"No payers found for case {case_state.case_id}. "
                f"Both payer_states and patient data are empty — cannot run policy analysis."
            )

        assessments = {}
        raw_assessments = {}  # Keep CoverageAssessment objects for provenance extraction
        findings = []
        all_gaps = []

        # Load full patient record for rich clinical context
        from backend.agents.intake_agent import IntakeAgent
        full_patient_data = {}
        try:
            intake_agent = IntakeAgent()
            full_patient_data = await intake_agent.load_patient_data(case_state.patient.patient_id)
        except FileNotFoundError:
            logger.warning("Full patient data not found, using case state only",
                          patient_id=case_state.patient.patient_id)

        for payer in payers:
            patient_info = {
                "patient_id": case_state.patient.patient_id,
                "demographics": {
                    "first_name": case_state.patient.first_name,
                    "last_name": case_state.patient.last_name,
                    "date_of_birth": case_state.patient.date_of_birth,
                },
                "clinical_profile": {
                    "diagnosis_codes": case_state.patient.diagnosis_codes,
                    "allergies": case_state.patient.allergies,
                },
                "insurance": {
                    "primary": {"payer_name": case_state.patient.primary_payer},
                    "secondary": {"payer_name": case_state.patient.secondary_payer} if case_state.patient.secondary_payer else None,
                },
                "prescriber": {
                    "name": case_state.medication.prescriber_name,
                    "npi": case_state.medication.prescriber_npi,
                    "specialty": full_patient_data.get("prescriber", {}).get("specialty", ""),
                    "credentials": full_patient_data.get("prescriber", {}).get("credentials", ""),
                },
            }

            # Include full clinical data from the patient record
            if full_patient_data:
                patient_info["disease_activity"] = full_patient_data.get("disease_activity", {})
                patient_info["laboratory_results"] = full_patient_data.get("laboratory_results", {})
                patient_info["procedures"] = full_patient_data.get("procedures", {})
                patient_info["pre_biologic_screening"] = full_patient_data.get("pre_biologic_screening", {})

            medication_info = {
                "medication_name": case_state.medication.medication_name,
                "generic_name": case_state.medication.generic_name,
                "dose": case_state.medication.dose,
                "frequency": case_state.medication.frequency,
                "diagnosis": case_state.medication.diagnosis,
                "icd10_code": case_state.medication.icd10_code,
                "clinical_rationale": case_state.medication.clinical_rationale,
                "prescriber_name": case_state.medication.prescriber_name,
                "prescriber_npi": case_state.medication.prescriber_npi,
                "prior_treatments": case_state.medication.prior_treatments,
                "supporting_labs": case_state.medication.supporting_labs,
            }

            assessment = await reasoner.assess_coverage(
                patient_info=patient_info,
                medication_info=medication_info,
                payer_name=payer,
                skip_cache=refresh,
            )

            raw_assessments[payer] = assessment
            assessments[payer] = assessment.model_dump()

            # Build findings from assessment
            likelihood = assessment.approval_likelihood
            status = "positive" if likelihood > 0.7 else "warning" if likelihood > 0.4 else "negative"
            criteria_not_met = assessment.criteria_total_count - assessment.criteria_met_count
            findings.append({
                "title": f"{payer} Coverage Assessment",
                "detail": f"Approval likelihood: {likelihood:.0%}. {assessment.criteria_met_count} criteria met, {criteria_not_met} not met.",
                "status": status
            })

            # Collect gaps
            for gap in assessment.documentation_gaps:
                all_gaps.append(gap.model_dump())

        # Generate reasoning summary
        if not assessments:
            raise ValueError(
                f"Policy analysis produced no assessments for case {case_state.case_id}. "
                f"Payers analyzed: {payers}"
            )
        best_payer = max(assessments.keys(), key=lambda p: assessments[p]["approval_likelihood"])
        best_likelihood = assessments[best_payer]["approval_likelihood"]

        reasoning = f"I analyzed coverage policies for {len(payers)} payers. "
        reasoning += f"{best_payer} shows the highest approval likelihood at {best_likelihood:.0%}. "

        if all_gaps:
            reasoning += f"I identified {len(all_gaps)} documentation gaps that should be addressed. "

        # Build recommendations
        recommendations = []
        if best_likelihood > 0.7:
            recommendations.append(f"Proceed with {best_payer} as primary target - high confidence")
        else:
            recommendations.append("Consider gathering additional documentation before submission")

        if all_gaps:
            recommendations.append(f"Address {len(all_gaps)} documentation gaps to improve approval chances")

        # Update case with analysis results
        await self.repository.update(
            case_id=case_state.case_id,
            updates={
                "coverage_assessments": serialize_for_json(assessments),
                "documentation_gaps": serialize_for_json(all_gaps),
            },
            change_description="Policy analysis completed"
        )

        # Build provenance and confidence details from raw assessments
        from backend.config.settings import get_settings
        _settings = get_settings()

        # Extract per-criterion confidence values
        all_criterion_confidences = [
            c.confidence
            for a in raw_assessments.values()
            for c in a.criteria_assessments
        ]
        min_conf = min(all_criterion_confidences) if all_criterion_confidences else 0.0
        max_conf = max(all_criterion_confidences) if all_criterion_confidences else 0.0
        mean_conf = (sum(all_criterion_confidences) / len(all_criterion_confidences)) if all_criterion_confidences else 0.0

        # Low-confidence criteria (below 0.7)
        low_confidence_criteria = [
            {
                "payer": p,
                "criterion": c.criterion_name,
                "confidence": c.confidence,
                "reasoning": c.reasoning,
            }
            for p, a in raw_assessments.items()
            for c in a.criteria_assessments
            if c.confidence < 0.7
        ]

        # Extract reasoning chains from llm_raw_response
        reasoning_chains = {
            p: a.llm_raw_response.get("reasoning_chain", [])
            for p, a in raw_assessments.items()
            if a.llm_raw_response
        }

        return {
            "stage": "policy_analysis",
            "reasoning": reasoning,
            "confidence": best_likelihood,
            "findings": findings,
            "recommendations": recommendations,
            "warnings": [f"Documentation gap: {gap['description']}" for gap in all_gaps[:3]] if all_gaps else [],
            "assessments": assessments,
            "documentation_gaps": all_gaps,
            "provenance": {
                "provider": "claude",
                "model": _settings.claude_model,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "is_cached": False,
            },
            "reasoning_chains": reasoning_chains,
            "confidence_details": {
                "aggregate": {"min": round(min_conf, 3), "mean": round(mean_conf, 3), "max": round(max_conf, 3)},
                "low_confidence_criteria": low_confidence_criteria,
            },
        }

    async def stream_policy_analysis(self, case_id: str, refresh: bool = False):
        """
        Stream policy analysis with incremental SSE events.
        Yields event dicts that the SSE endpoint serializes.

        This is an async generator that mirrors _run_policy_analysis_stage
        but yields progress events at key processing milestones, providing
        real-time feedback during long-running Claude LLM calls.

        Args:
            case_id: Case identifier
            refresh: If True, force fresh LLM call bypassing cache

        Yields:
            dict: Event objects with 'event' key and stage-specific data
        """
        case_state = await self.get_case_state(case_id)
        if not case_state:
            yield {"event": "error", "message": f"Case not found: {case_id}"}
            return

        # Check cache first
        if not refresh and case_state.coverage_assessments:
            cached = case_state.coverage_assessments
            if isinstance(cached, dict) and any(cached.values()):
                yield {"event": "progress", "message": "Using cached analysis results", "percent": 50}
                result = await self._run_policy_analysis_stage(case_state, refresh=False)
                yield {"event": "stage_complete", **result}
                return

        from backend.reasoning.policy_reasoner import get_policy_reasoner
        from backend.agents.intake_agent import IntakeAgent

        reasoner = get_policy_reasoner()
        payers = _derive_payers_from_patient(case_state)
        total_payers = len(payers)

        if not payers:
            yield {
                "event": "error",
                "message": f"No payers found for case {case_state.case_id}. "
                           f"Both payer_states and patient data are empty — cannot run policy analysis."
            }
            return

        yield {"event": "progress", "message": f"Analyzing {total_payers} payer(s)", "percent": 5}

        # Load patient data
        full_patient_data = {}
        try:
            intake_agent = IntakeAgent()
            full_patient_data = await intake_agent.load_patient_data(case_state.patient.patient_id)
        except FileNotFoundError:
            logger.warning("Full patient data not found, using case state only",
                          patient_id=case_state.patient.patient_id)

        yield {"event": "progress", "message": "Patient data loaded", "percent": 10}

        assessments = {}
        findings = []
        all_gaps = []

        for idx, payer in enumerate(payers):
            payer_percent_start = 10 + (80 * idx // total_payers)
            payer_percent_end = 10 + (80 * (idx + 1) // total_payers)

            yield {"event": "payer_start", "payer_name": payer, "percent": payer_percent_start}

            # Build patient_info with full clinical context
            patient_info = {
                "patient_id": case_state.patient.patient_id,
                "demographics": {
                    "first_name": case_state.patient.first_name,
                    "last_name": case_state.patient.last_name,
                    "date_of_birth": case_state.patient.date_of_birth,
                },
                "clinical_profile": {
                    "diagnosis_codes": case_state.patient.diagnosis_codes,
                    "allergies": case_state.patient.allergies,
                },
                "insurance": {
                    "primary": {"payer_name": case_state.patient.primary_payer},
                    "secondary": {"payer_name": case_state.patient.secondary_payer} if case_state.patient.secondary_payer else None,
                },
                "prescriber": {
                    "name": case_state.medication.prescriber_name,
                    "npi": case_state.medication.prescriber_npi,
                    "specialty": full_patient_data.get("prescriber", {}).get("specialty", ""),
                    "credentials": full_patient_data.get("prescriber", {}).get("credentials", ""),
                },
            }

            if full_patient_data:
                patient_info["disease_activity"] = full_patient_data.get("disease_activity", {})
                patient_info["laboratory_results"] = full_patient_data.get("laboratory_results", {})
                patient_info["procedures"] = full_patient_data.get("procedures", {})
                patient_info["pre_biologic_screening"] = full_patient_data.get("pre_biologic_screening", {})

            medication_info = {
                "medication_name": case_state.medication.medication_name,
                "generic_name": case_state.medication.generic_name,
                "dose": case_state.medication.dose,
                "frequency": case_state.medication.frequency,
                "diagnosis": case_state.medication.diagnosis,
                "icd10_code": case_state.medication.icd10_code,
                "clinical_rationale": case_state.medication.clinical_rationale,
                "prescriber_name": case_state.medication.prescriber_name,
                "prescriber_npi": case_state.medication.prescriber_npi,
                "prior_treatments": case_state.medication.prior_treatments,
                "supporting_labs": case_state.medication.supporting_labs,
            }

            yield {"event": "progress", "message": f"Running Claude assessment for {payer}...", "percent": payer_percent_start + 5}

            assessment = await reasoner.assess_coverage(
                patient_info=patient_info,
                medication_info=medication_info,
                payer_name=payer,
                skip_cache=refresh,
            )

            assessments[payer] = assessment.model_dump()

            likelihood = assessment.approval_likelihood
            status = "positive" if likelihood > 0.7 else "warning" if likelihood > 0.4 else "negative"
            criteria_not_met = assessment.criteria_total_count - assessment.criteria_met_count
            findings.append({
                "title": f"{payer} Coverage Assessment",
                "detail": f"Approval likelihood: {likelihood:.0%}. {assessment.criteria_met_count} criteria met, {criteria_not_met} not met.",
                "status": status,
            })

            for gap in assessment.documentation_gaps:
                all_gaps.append(gap.model_dump())

            yield {
                "event": "payer_complete",
                "payer_name": payer,
                "coverage_status": assessment.coverage_status.value,
                "approval_likelihood": likelihood,
                "criteria_met": assessment.criteria_met_count,
                "criteria_total": assessment.criteria_total_count,
                "percent": payer_percent_end,
            }

        # Build final result
        yield {"event": "progress", "message": "Finalizing analysis...", "percent": 92}

        if not assessments:
            yield {
                "event": "error",
                "message": f"Policy analysis produced no assessments for case {case_state.case_id}. "
                           f"Payers analyzed: {payers}"
            }
            return

        best_payer = max(assessments.keys(), key=lambda p: assessments[p]["approval_likelihood"])
        best_likelihood = assessments[best_payer]["approval_likelihood"]

        reasoning = f"I analyzed coverage policies for {len(payers)} payers. "
        reasoning += f"{best_payer} shows the highest approval likelihood at {best_likelihood:.0%}. "
        if all_gaps:
            reasoning += f"I identified {len(all_gaps)} documentation gaps that should be addressed. "

        recommendations = []
        if best_likelihood > 0.7:
            recommendations.append(f"Proceed with {best_payer} as primary target - high confidence")
        else:
            recommendations.append("Consider gathering additional documentation before submission")
        if all_gaps:
            recommendations.append(f"Address {len(all_gaps)} documentation gaps to improve approval chances")

        # Update case with analysis results
        await self.repository.update(
            case_id=case_state.case_id,
            updates={
                "coverage_assessments": serialize_for_json(assessments),
                "documentation_gaps": serialize_for_json(all_gaps),
            },
            change_description="Policy analysis completed (streamed)"
        )

        yield {
            "event": "stage_complete",
            "stage": "policy_analysis",
            "reasoning": reasoning,
            "confidence": best_likelihood,
            "findings": findings,
            "recommendations": recommendations,
            "warnings": [f"Documentation gap: {gap['description']}" for gap in all_gaps[:3]] if all_gaps else [],
            "assessments": serialize_for_json(assessments),
            "documentation_gaps": serialize_for_json(all_gaps),
            "percent": 100,
        }

    async def _run_cohort_analysis_stage(self, case_state) -> Dict[str, Any]:
        """Run cohort analysis — gap-driven when documentation_gaps exist."""
        from backend.agents.strategic_intelligence_agent import get_strategic_intelligence_agent
        from backend.agents.intake_agent import IntakeAgent

        case_dict = await self.get_case(case_state.case_id)
        patient_id = case_state.patient.patient_id

        # Load patient data
        full_patient_data = {}
        try:
            intake_agent = IntakeAgent()
            full_patient_data = await intake_agent.load_patient_data(patient_id)
        except FileNotFoundError:
            logger.warning("Full patient data not found", patient_id=patient_id)

        agent = get_strategic_intelligence_agent()

        # Use gap-driven analysis when documentation gaps exist from policy analysis
        documentation_gaps = case_dict.get("documentation_gaps", [])

        if documentation_gaps:
            analysis = await agent.generate_gap_driven_cohort_analysis(
                case_data=case_dict,
                patient_data=full_patient_data,
                documentation_gaps=documentation_gaps,
            )

            # Build findings from gap-driven analysis
            findings = []
            cohort_size = analysis.get("total_cohort_size", 0)
            gap_count = len(analysis.get("gap_analyses", []))

            if cohort_size > 0:
                findings.append({
                    "title": "Gap-Driven Analysis",
                    "detail": f"Analyzed {gap_count} documentation gaps across {cohort_size} similar historical cases",
                    "status": "neutral",
                })

            for ga in (analysis.get("gap_analyses") or [])[:3]:
                delta = ga.get("overall", {}).get("impact_delta", 0)
                findings.append({
                    "title": ga.get("gap_description", "Gap")[:60],
                    "detail": f"{abs(delta):.0%} higher denial rate when missing (n={ga.get('overall', {}).get('sample_size_missing', 0)})",
                    "status": "negative" if delta > 0.3 else "warning" if delta > 0.1 else "neutral",
                })

            synthesis = analysis.get("llm_synthesis", {})
            reasoning = synthesis.get("overall_risk_assessment", f"Analyzed {gap_count} gaps across {cohort_size} similar cases.")

            recommendations = [
                rec.get("action", "")
                for rec in (synthesis.get("recommended_actions") or [])[:3]
            ]

            warnings = []
            for ga in (analysis.get("gap_analyses") or []):
                for reason in (ga.get("top_denial_reasons") or [])[:1]:
                    warnings.append(f"{ga.get('gap_description', 'Gap')[:40]}: {reason.get('reason', '')}")
        else:
            # No gaps — run standard cohort analysis
            analysis = await agent.generate_cohort_analysis(
                case_data=case_dict,
                patient_data=full_patient_data,
            )

            findings = []
            total = analysis.get("total_similar_cases", 0)
            approved = analysis.get("approved_count", 0)
            denied = analysis.get("denied_count", 0)

            if total > 0:
                approval_rate = round((approved / total) * 100)
                findings.append({
                    "title": "Cohort Approval Rate",
                    "detail": f"{approval_rate}% approval from {total} similar cases ({approved} approved, {denied} denied)",
                    "status": "positive" if approval_rate > 70 else "warning" if approval_rate > 40 else "negative",
                })

            for insight in (analysis.get("differentiating_insights") or [])[:3]:
                status_map = {"favorable": "positive", "at_risk": "negative", "neutral": "neutral"}
                findings.append({
                    "title": insight.get("headline", "Insight"),
                    "detail": insight.get("current_patient_detail", insight.get("finding", "")),
                    "status": status_map.get(insight.get("current_patient_status", "neutral"), "neutral"),
                })

            position = analysis.get("current_patient_position", {})
            reasoning = position.get("overall_summary", f"Analyzed {total} similar historical cases.")

            recommendations = [
                rec.get("action", "")
                for rec in (analysis.get("actionable_recommendations") or [])[:3]
            ]

            warnings = [
                f"Top denial reason: {r.get('reason', '')}" for r in (analysis.get("top_denial_reasons") or [])[:2]
            ]

        # Update case stage
        await self.repository.update(
            case_id=case_state.case_id,
            updates={"stage": CaseStage.COHORT_ANALYSIS.value},
            change_description="Cohort analysis completed",
        )

        return {
            "stage": "cohort_analysis",
            "reasoning": reasoning,
            "confidence": 0.7 if documentation_gaps else analysis.get("current_patient_position", {}).get("estimated_cohort_match", 0.5),
            "findings": findings,
            "recommendations": recommendations,
            "warnings": warnings,
            "cohort_data": serialize_for_json(analysis),
        }

    def _build_cohort_summary_for_recommendation(
        self,
        cohort_analysis: Dict[str, Any],
        gap_driven_analysis: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Build a rich cohort analysis summary for the AI recommendation prompt.

        Combines basic cohort stats with gap-driven synthesis (cross-gap insights,
        patient position, gap priority ranking, recommended actions).
        """
        summary: Dict[str, Any] = {
            "total_similar_cases": cohort_analysis.get("total_similar_cases", 0),
            "approved_count": cohort_analysis.get("approved_count", 0),
            "denied_count": cohort_analysis.get("denied_count", 0),
            "patient_position": cohort_analysis.get("current_patient_position", {}),
            "top_denial_reasons": cohort_analysis.get("top_denial_reasons", []),
            "differentiating_insights": cohort_analysis.get("differentiating_insights", []),
        }

        # Enrich with gap-driven cohort synthesis if available
        llm_synthesis = gap_driven_analysis.get("llm_synthesis", {})
        if llm_synthesis:
            summary["gap_driven_synthesis"] = {
                "overall_risk_assessment": llm_synthesis.get("overall_risk_assessment", ""),
                "patient_position_summary": llm_synthesis.get("patient_position_summary", ""),
                "hidden_insights": llm_synthesis.get("hidden_insights", []),
                "gap_priority_ranking": llm_synthesis.get("gap_priority_ranking", []),
                "recommended_actions": llm_synthesis.get("recommended_actions", []),
            }

        # Include per-gap key findings (compact — just gap_id + differentiator highlights)
        gap_analyses = gap_driven_analysis.get("gap_analyses", [])
        if gap_analyses:
            gap_findings = []
            for ga in gap_analyses:
                diff = ga.get("gap_differentiators", {})
                finding = {
                    "gap_id": ga.get("gap_id", ""),
                    "denial_rate_with_gap": ga.get("overall", {}).get("denial_rate_missing", 0),
                    "denial_rate_without_gap": ga.get("overall", {}).get("denial_rate_present", 0),
                }
                if diff.get("status") == "complete":
                    insights = diff.get("differentiating_insights", [])
                    finding["key_differentiators"] = [
                        {"factor": i.get("factor", ""), "insight": i.get("insight", "")}
                        for i in insights[:3]
                    ]
                    finding["patient_position"] = diff.get("current_patient_position", {})
                gap_findings.append(finding)
            summary["per_gap_findings"] = gap_findings

        return summary

    async def _run_ai_recommendation_stage(self, case_state) -> Dict[str, Any]:
        """Synthesize policy analysis + cohort evidence into a final AI recommendation."""
        import hashlib as _hashlib
        from backend.reasoning.llm_gateway import get_llm_gateway
        from backend.reasoning.prompt_loader import get_prompt_loader
        from backend.models.enums import TaskCategory

        case_dict = await self.get_case(case_state.case_id)

        # Gather policy analysis results
        coverage_assessments = case_dict.get("coverage_assessments", {})
        documentation_gaps = case_dict.get("documentation_gaps", [])

        # Check cache: patient_id + medication + payer + sorted gap IDs
        patient_id = case_state.patient.patient_id
        medication = case_state.medication.medication_name.lower().strip()
        payer = case_state.patient.primary_payer.lower().strip()
        gap_ids = sorted(
            (g.get("gap_id") or g.get("id") or g.get("description", "")[:30])
            for g in documentation_gaps
        )
        rec_cache_key = _hashlib.sha256(
            f"ai_rec::{patient_id}::{medication}::{payer}::{'|'.join(gap_ids)}".encode()
        ).hexdigest()

        cached = await self._get_cached_ai_recommendation(rec_cache_key)
        if cached:
            logger.info("AI recommendation cache hit", patient_id=patient_id, cache_key=rec_cache_key[:12])
            # Still update case stage
            await self.repository.update(
                case_id=case_state.case_id,
                updates={"stage": CaseStage.AI_RECOMMENDATION.value},
                change_description="AI recommendation (cached)",
            )
            return cached

        # Gather cohort analysis (from the prior stage stored in strategic intelligence cache)
        from backend.agents.strategic_intelligence_agent import get_strategic_intelligence_agent
        from backend.agents.intake_agent import IntakeAgent

        full_patient_data = {}
        try:
            intake_agent = IntakeAgent()
            full_patient_data = await intake_agent.load_patient_data(case_state.patient.patient_id)
        except FileNotFoundError:
            logger.warning("Full patient data not found", patient_id=case_state.patient.patient_id)

        agent = get_strategic_intelligence_agent()
        cohort_analysis = await agent.generate_cohort_analysis(
            case_data=case_dict,
            patient_data=full_patient_data,
        )

        # Also run gap-driven cohort analysis if documentation gaps exist
        gap_driven_analysis = {}
        if documentation_gaps:
            try:
                gap_driven_analysis = await agent.generate_gap_driven_cohort_analysis(
                    case_data=case_dict,
                    patient_data=full_patient_data,
                    documentation_gaps=documentation_gaps,
                )
            except Exception as e:
                logger.warning("Gap-driven cohort analysis failed", error=str(e))

        # Build patient clinical summary — include key clinical data to prevent hallucination
        disease_activity = full_patient_data.get("disease_activity", {})
        lab_panels = full_patient_data.get("laboratory_results", {}).get("panels", {})
        procedures = full_patient_data.get("procedures", {})
        screening = full_patient_data.get("pre_biologic_screening", {})
        prior_tx = full_patient_data.get("prior_treatments", [])

        # Extract key lab values
        lab_values = {}
        for panel_name, panel in lab_panels.items():
            for result in panel.get("results", []):
                test = result.get("test", "")
                if test in ("CRP", "ESR", "Albumin", "Hemoglobin", "Fecal Calprotectin"):
                    lab_values[test] = f"{result.get('value')} {result.get('unit', '')}"

        # Extract procedure dates
        procedure_dates = {}
        for proc_name, proc in procedures.items():
            if isinstance(proc, dict) and "procedure_date" in proc:
                procedure_dates[proc.get("procedure_name", proc_name)] = proc["procedure_date"]

        patient_summary = {
            "name": f"{case_state.patient.first_name} {case_state.patient.last_name}",
            "diagnosis": case_state.medication.diagnosis,
            "icd10_code": case_state.medication.icd10_code,
            "medication": case_state.medication.medication_name,
            "clinical_rationale": case_state.medication.clinical_rationale,
            "primary_payer": case_state.patient.primary_payer,
            "secondary_payer": case_state.patient.secondary_payer,
            "disease_severity": disease_activity.get("disease_severity"),
            "cdai_score": disease_activity.get("cdai_score"),
            "hbi_score": disease_activity.get("harvey_bradshaw_index"),
            "ses_cd_score": disease_activity.get("ses_cd_score"),
            "disease_phenotype": disease_activity.get("disease_phenotype"),
            "lab_values": lab_values,
            "procedures_with_dates": procedure_dates,
            "prior_treatments": [
                {"medication": t.get("medication_name"), "outcome": t.get("outcome"), "duration_weeks": t.get("duration_weeks")}
                for t in prior_tx
            ] if prior_tx else case_state.medication.prior_treatments,
            "screening_status": {
                "tb": screening.get("tuberculosis_screening", {}).get("status"),
                "hepatitis_b": screening.get("hepatitis_b_screening", {}).get("status"),
                "hepatitis_c": screening.get("hepatitis_c_screening", {}).get("status"),
            },
        }

        # Load and fill prompt
        prompt_loader = get_prompt_loader()
        prompt = prompt_loader.load(
            "strategy/ai_recommendation_synthesis.txt",
            variables={
                "patient_summary": patient_summary,
                "coverage_assessments": coverage_assessments,
                "documentation_gaps": documentation_gaps,
                "cohort_analysis_summary": self._build_cohort_summary_for_recommendation(
                    cohort_analysis, gap_driven_analysis,
                ),
            },
        )

        # Call Claude for synthesis (high-stakes clinical decision)
        gateway = get_llm_gateway()
        result = await gateway.generate(
            task_category=TaskCategory.POLICY_REASONING,
            prompt=prompt,
            temperature=0.0,
            response_format="json",
        )

        # The LLM gateway returns the parsed JSON dict directly (with provider/task_category added).
        # If the response was wrapped in a "content" or "response" key, unwrap it.
        import json as _json
        if "content" in result:
            content = result["content"]
            try:
                recommendation = _json.loads(content) if isinstance(content, str) else content
            except _json.JSONDecodeError:
                recommendation = {"recommended_action": "submit_to_payer", "summary": str(content), "evidence": [], "risk_factors": []}
        elif "response" in result:
            response_text = result["response"]
            if isinstance(response_text, str) and response_text.strip().startswith("{"):
                try:
                    recommendation = _json.loads(response_text)
                except _json.JSONDecodeError:
                    recommendation = {"recommended_action": "submit_to_payer", "summary": response_text, "evidence": [], "risk_factors": []}
            else:
                recommendation = {"recommended_action": "submit_to_payer", "summary": str(response_text), "evidence": [], "risk_factors": []}
        else:
            # Result IS the recommendation dict (Claude JSON mode returns parsed dict directly)
            recommendation = {k: v for k, v in result.items() if k not in ("provider", "task_category", "model", "is_fallback", "_usage")}

        # Build stage response
        action = recommendation.get("recommended_action", "submit_to_payer")
        summary = recommendation.get("summary", "AI recommendation generated.")
        evidence = recommendation.get("evidence", [])
        risk_factors = recommendation.get("risk_factors", [])
        provider_actions = recommendation.get("provider_actions", [])

        findings = [{
            "title": "Recommended Action",
            "detail": f"{action.replace('_', ' ').title()}: {summary}",
            "status": "positive" if action == "submit_to_payer" else "warning",
        }]
        for item in evidence[:3]:
            findings.append({
                "title": item.get("label", "Evidence"),
                "detail": item.get("detail", str(item)),
                "status": "positive",
            })

        warnings = [f"Risk: {rf}" if isinstance(rf, str) else f"Risk: {rf.get('description', rf)}" for rf in risk_factors[:3]]

        # Update case stage
        await self.repository.update(
            case_id=case_state.case_id,
            updates={"stage": CaseStage.AI_RECOMMENDATION.value},
            change_description="AI recommendation synthesized",
        )

        stage_result = {
            "stage": "ai_recommendation",
            "reasoning": summary,
            "confidence": recommendation.get("confidence", 0.7),
            "findings": findings,
            "recommendations": [action.replace("_", " ").title()] + provider_actions[:2],
            "warnings": warnings,
            "recommendation": serialize_for_json(recommendation),
            "provenance": {
                "provider": result.get("provider", "unknown"),
                "model": result.get("model", "unknown"),
                "is_fallback": result.get("is_fallback", False),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "is_cached": False,
            },
        }

        # Cache the recommendation indefinitely
        await self._store_cached_ai_recommendation(rec_cache_key, patient_id, medication, payer, stage_result)

        return stage_result

    async def _get_cached_ai_recommendation(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached AI recommendation if available."""
        from backend.storage.database import get_db
        from backend.storage.models import CohortAnalysisCacheModel
        from sqlalchemy import select
        try:
            async with get_db() as session:
                row = (await session.execute(
                    select(CohortAnalysisCacheModel)
                    .where(CohortAnalysisCacheModel.cache_key_hash == cache_key)
                )).scalar_one_or_none()
                if row is None:
                    return None
                logger.info("AI recommendation cache hit", cache_key=cache_key[:12])
                return row.analysis_data
        except Exception as e:
            logger.warning("AI recommendation cache read error", error=str(e))
            return None

    async def _store_cached_ai_recommendation(
        self, cache_key: str, patient_id: str, medication: str, payer: str, result: Dict[str, Any],
    ) -> None:
        """Store AI recommendation in cache indefinitely."""
        from backend.storage.database import get_db
        from backend.storage.models import CohortAnalysisCacheModel
        from sqlalchemy import delete
        import uuid as _uuid
        try:
            async with get_db() as session:
                await session.execute(
                    delete(CohortAnalysisCacheModel).where(CohortAnalysisCacheModel.cache_key_hash == cache_key)
                )
                session.add(CohortAnalysisCacheModel(
                    id=str(_uuid.uuid4()),
                    cache_key_hash=cache_key,
                    medication_name=medication,
                    icd10_family="",
                    payer_name=payer,
                    cached_at=datetime.now(timezone.utc),
                    expires_at=datetime.now(timezone.utc) + timedelta(days=365 * 10),
                    analysis_data=result,
                    approved_cohort_size=0,
                    denied_cohort_size=0,
                    total_similar_cases=0,
                ))
                await session.commit()
                logger.info("Cached AI recommendation", cache_key=cache_key[:12], patient_id=patient_id)
        except Exception as e:
            logger.warning("AI recommendation cache write error", error=str(e))

    async def _run_strategy_generation_stage(self, case_state) -> Dict[str, Any]:
        """Run strategy generation and return agent reasoning."""
        from backend.reasoning.strategy_scorer import get_strategy_scorer
        from backend.models.coverage import CoverageAssessment

        scorer = get_strategy_scorer()

        # Get coverage assessments from case
        case_dict = await self.get_case(case_state.case_id)
        assessments_data = case_dict.get("coverage_assessments", {})

        # Convert to CoverageAssessment objects
        assessments = {}
        for payer, data in assessments_data.items():
            assessments[payer] = CoverageAssessment(**data)

        # Generate strategies
        strategies = scorer.generate_strategies(assessments)
        strategy_dicts = [s.model_dump() for s in strategies]

        # Score strategies
        scored = []
        for strategy in strategies:
            score_result = scorer.score_strategy(
                strategy=strategy,
                case_id=case_state.case_id,
                coverage_assessments=assessments
            )
            scored.append({
                "strategy": strategy.model_dump(),
                "score": score_result.model_dump()
            })

        # Sort by total score
        scored.sort(key=lambda x: x["score"]["total_score"], reverse=True)

        # Build findings
        findings = []
        for item in scored:
            s = item["strategy"]
            score = item["score"]["total_score"]
            status = "positive" if score > 7 else "neutral" if score > 5 else "warning"
            findings.append({
                "title": s["name"],
                "detail": f"Score: {score:.1f}/10. {s['description']}",
                "status": status
            })

        # Generate reasoning
        best = scored[0]
        reasoning = f"I generated {len(strategies)} strategies with different trade-offs. "
        reasoning += f"'{best['strategy']['name']}' scores highest at {best['score']['total_score']:.1f}/10. "
        reasoning += "This strategy optimizes for approval confidence while maintaining acceptable speed to therapy. "

        # Build recommendations
        recommendations = [
            f"Recommended: {best['strategy']['name']} (highest overall score)",
            f"Alternative: {scored[1]['strategy']['name']} if speed is prioritized" if len(scored) > 1 else None,
        ]
        recommendations = [r for r in recommendations if r]

        # Update case with strategies
        await self.repository.update(
            case_id=case_state.case_id,
            updates={
                "available_strategies": serialize_for_json(strategy_dicts),
                "stage": CaseStage.STRATEGY_SELECTION.value,
            },
            change_description="Strategies generated"
        )

        return {
            "stage": "strategy_generation",
            "reasoning": reasoning,
            "confidence": best["score"]["total_score"] / 10,
            "findings": findings,
            "recommendations": recommendations,
            "warnings": [],
            "strategies": [item["strategy"] for item in scored],
            "scores": [item["score"] for item in scored],
            "recommended_id": best["strategy"]["strategy_id"]
        }

    async def _run_action_coordination_stage(self, case_state) -> Dict[str, Any]:
        """Run action coordination and return agent reasoning."""
        from backend.agents.action_coordinator import get_action_coordinator
        from backend.orchestrator.state import create_initial_state
        from backend.agents.intake_agent import get_intake_agent

        # Load patient data
        intake_agent = get_intake_agent()
        patient_data = await intake_agent.load_patient_data(case_state.patient.patient_id)

        medication_data = {
            "medication_request": {
                "medication_name": case_state.medication.medication_name,
                "generic_name": case_state.medication.generic_name,
                "ndc_code": case_state.medication.ndc_code,
                "dose": case_state.medication.dose,
                "frequency": case_state.medication.frequency,
                "route": case_state.medication.route,
                "duration": case_state.medication.duration,
                "diagnosis": case_state.medication.diagnosis,
                "icd10_code": case_state.medication.icd10_code,
                "prescriber_npi": case_state.medication.prescriber_npi,
                "prescriber_name": case_state.medication.prescriber_name,
                "clinical_rationale": case_state.medication.clinical_rationale,
            }
        }

        # Create orchestrator state
        state = create_initial_state(
            case_id=case_state.case_id,
            patient_id=case_state.patient.patient_id,
            patient_data=patient_data,
            medication_data=medication_data,
            payers=_derive_payers_from_patient(case_state)
        )

        # Get selected strategy (need full strategy data including payer_sequence)
        case_dict = await self.get_case(case_state.case_id)
        selected_strategy_id = case_dict.get("selected_strategy_id")
        available_strategies = case_dict.get("available_strategies", [])

        # Find the full strategy object by ID
        selected_strategy = None
        for strategy in available_strategies:
            if strategy.get("strategy_id") == selected_strategy_id:
                selected_strategy = strategy
                break

        # Get payer list from case state
        payers = _derive_payers_from_patient(case_state)

        # Ensure selected_strategy has a valid payer_sequence
        if not selected_strategy:
            selected_strategy = {
                "strategy_id": selected_strategy_id,
                "payer_sequence": payers
            }
        elif not selected_strategy.get("payer_sequence"):
            # Strategy found but has empty payer_sequence - add it
            selected_strategy["payer_sequence"] = payers

        state["selected_strategy"] = selected_strategy
        state["available_strategies"] = available_strategies

        # Execute actions
        coordinator = get_action_coordinator()
        result = await coordinator.execute_next_action(state)

        # Build findings
        findings = []
        action_type = result.get("action_type", "unknown")
        findings.append({
            "title": f"Action: {action_type}",
            "detail": f"Executing {action_type} action based on selected strategy",
            "status": "positive"
        })

        # Check payer states from result
        payer_states = result.get("payer_states", {})
        for payer, payer_state in payer_states.items():
            status = payer_state.get("status", "unknown")
            findings.append({
                "title": f"{payer} Status",
                "detail": f"Current status: {status}",
                "status": "positive" if status == "approved" else "neutral" if status in ["submitted", "pending"] else "warning"
            })

        reasoning = f"I executed the {action_type} action. "
        if payer_states:
            submitted = [p for p, s in payer_states.items() if s.get("status") in ["submitted", "approved", "pending"]]
            if submitted:
                reasoning += f"Submitted to: {', '.join(submitted)}. "

        # Update case
        await self.repository.update(
            case_id=case_state.case_id,
            updates={
                "stage": CaseStage.MONITORING.value,
                "payer_states": serialize_for_json(payer_states),
                "completed_actions": serialize_for_json(result.get("completed_actions", [])),
            },
            change_description="Actions executed"
        )

        return {
            "stage": "action_coordination",
            "reasoning": reasoning,
            "confidence": 0.85,
            "findings": findings,
            "recommendations": ["Monitor payer responses", "Check for additional documentation requests"],
            "warnings": [],
            "payer_states": payer_states,
            "actions_executed": [action_type]
        }

    async def _run_monitoring_stage(self, case_state) -> Dict[str, Any]:
        """Run monitoring: poll payer statuses, detect denials, route to recovery."""
        import dataclasses
        from backend.agents.action_coordinator import get_action_coordinator
        from backend.orchestrator.transitions import check_payer_responses, needs_recovery, initiate_recovery
        from backend.orchestrator.state import create_initial_state
        from backend.agents.intake_agent import get_intake_agent

        coordinator = get_action_coordinator()
        payer_states = {}
        for payer, ps in case_state.payer_states.items():
            if isinstance(ps, dict):
                payer_states[payer] = ps
            elif dataclasses.is_dataclass(ps):
                payer_states[payer] = serialize_for_json(dataclasses.asdict(ps))
            else:
                payer_states[payer] = serialize_for_json(ps)

        # Build orchestrator state for transition helpers
        intake_agent = get_intake_agent()
        patient_data = await intake_agent.load_patient_data(case_state.patient.patient_id)
        medication_data = {
            "medication_request": {
                "medication_name": case_state.medication.medication_name,
                "dose": case_state.medication.dose,
                "frequency": case_state.medication.frequency,
                "route": case_state.medication.route,
                "duration": case_state.medication.duration,
                "diagnosis": case_state.medication.diagnosis,
                "icd10_code": case_state.medication.icd10_code,
            }
        }
        orch_state = create_initial_state(
            case_id=case_state.case_id,
            patient_id=case_state.patient.patient_id,
            patient_data=patient_data,
            medication_data=medication_data,
            payers=_derive_payers_from_patient(case_state)
        )
        orch_state["payer_states"] = payer_states

        # Poll each submitted/pending payer
        updated_payer_states = dict(payer_states)
        payer_responses = {}
        recovery_needed = False
        recovery_reason = None
        for payer_name, payer_state in payer_states.items():
            status = payer_state.get("status", "not_submitted")
            if status in ["submitted", "pending", "under_review"]:
                try:
                    status_result = await coordinator.check_payer_status(orch_state, payer_name)
                    if "payer_states" in status_result:
                        updated_payer_states.update(status_result["payer_states"])
                    if "payer_responses" in status_result:
                        payer_responses.update(status_result["payer_responses"])
                    if status_result.get("recovery_needed"):
                        recovery_needed = True
                        recovery_reason = status_result.get("recovery_reason")
                except Exception as e:
                    logger.error("Failed to check payer status", payer=payer_name, error=str(e))

        orch_state["payer_states"] = updated_payer_states
        orch_state["payer_responses"] = payer_responses
        response_status = check_payer_responses(orch_state)

        findings = []
        for payer, ps in updated_payer_states.items():
            status = ps.get("status", "unknown")
            denial_reason = ps.get("denial_reason")
            if status == "denied":
                findings.append({"title": f"{payer}: DENIED", "detail": denial_reason or "Payer denied the authorization", "status": "negative"})
            elif status == "approved":
                findings.append({"title": f"{payer}: Approved", "detail": "Authorization approved", "status": "positive"})
            else:
                findings.append({"title": f"{payer}: {status}", "detail": f"Current status: {status}", "status": "neutral"})

        # Determine next stage
        if response_status == "denied" and (recovery_needed or needs_recovery(orch_state)):
            recovery_data = initiate_recovery(orch_state, recovery_reason or "Payer denial - appeal available")
            next_stage = CaseStage.RECOVERY.value if hasattr(CaseStage, 'RECOVERY') else "recovery"
            reasoning = f"Monitoring detected a denial from payer. {recovery_reason or 'Initiating recovery workflow for appeal.'}. "

            await self.repository.update(
                case_id=case_state.case_id,
                updates={
                    "stage": next_stage,
                    "payer_states": serialize_for_json(updated_payer_states),
                },
                change_description="Denial detected, transitioning to recovery"
            )

            return {
                "stage": "monitoring",
                "reasoning": reasoning,
                "confidence": 0.9,
                "findings": findings,
                "recommendations": ["Appeal the denial", "Prepare peer-to-peer review documentation"],
                "warnings": [f"Denial detected: {recovery_reason}"] if recovery_reason else ["Payer denial detected"],
                "payer_states": updated_payer_states,
                "recovery_needed": True,
                "recovery_reason": recovery_reason,
            }
        elif response_status == "approved":
            await self.repository.update(
                case_id=case_state.case_id,
                updates={
                    "stage": CaseStage.COMPLETED.value,
                    "payer_states": serialize_for_json(updated_payer_states),
                },
                change_description="All payers approved"
            )
            return {
                "stage": "monitoring",
                "reasoning": "All payers have approved the authorization.",
                "confidence": 1.0,
                "findings": findings,
                "recommendations": ["Case complete - all authorizations approved"],
                "warnings": [],
                "payer_states": updated_payer_states,
            }
        else:
            await self.repository.update(
                case_id=case_state.case_id,
                updates={"payer_states": serialize_for_json(updated_payer_states)},
                change_description="Monitoring update"
            )
            return {
                "stage": "monitoring",
                "reasoning": f"Payer responses are {response_status}. Monitoring continues.",
                "confidence": 0.6,
                "findings": findings,
                "recommendations": ["Continue monitoring payer responses"],
                "warnings": [],
                "payer_states": updated_payer_states,
            }

    async def approve_stage(self, case_id: str, stage: str) -> Dict[str, Any]:
        """
        Approve a stage and advance to next stage.

        Args:
            case_id: Case identifier
            stage: Stage being approved

        Returns:
            Updated case data
        """
        logger.info("Approving stage", case_id=case_id, stage=stage)

        # Stage progression map
        next_stage_map = {
            "intake": CaseStage.POLICY_ANALYSIS,
            "policy_analysis": CaseStage.COHORT_ANALYSIS,
            "cohort_analysis": CaseStage.AI_RECOMMENDATION,
            "ai_recommendation": CaseStage.AWAITING_HUMAN_DECISION,
            "strategy_generation": CaseStage.STRATEGY_SELECTION,
            "strategy_selection": CaseStage.ACTION_COORDINATION,
            "action_coordination": CaseStage.MONITORING,
            "monitoring": CaseStage.COMPLETED,
        }

        if stage not in next_stage_map:
            raise ValueError(f"Cannot approve stage: {stage}")

        next_stage = next_stage_map[stage]

        await self.repository.update(
            case_id=case_id,
            updates={"stage": next_stage.value},
            change_description=f"Stage {stage} approved, advancing to {next_stage.value}"
        )

        # Log audit event
        await self.audit_logger.log_stage_change(
            case_id=case_id,
            from_stage=stage,
            to_stage=next_stage.value,
            reason="Human approval"
        )

        case = await self.get_case(case_id)
        return case

    async def select_strategy(self, case_id: str, strategy_id: str) -> Dict[str, Any]:
        """
        Select a strategy for the case.

        Args:
            case_id: Case identifier
            strategy_id: Selected strategy ID

        Returns:
            Updated case data
        """
        logger.info("Selecting strategy", case_id=case_id, strategy_id=strategy_id)

        case_dict = await self.get_case(case_id)
        if not case_dict:
            raise ValueError(f"Case not found: {case_id}")

        # Find the selected strategy
        strategies = case_dict.get("available_strategies", [])
        selected = next((s for s in strategies if s.get("strategy_id") == strategy_id), None)

        if not selected:
            raise ValueError(f"Strategy not found: {strategy_id}")

        # Update case with selected strategy
        await self.repository.update(
            case_id=case_id,
            updates={
                "selected_strategy_id": strategy_id,
                "strategy_rationale": f"Selected by user: {selected.get('name', strategy_id)}",
                "stage": CaseStage.ACTION_COORDINATION.value,
            },
            change_description=f"Strategy selected: {strategy_id}"
        )

        # Log audit event
        await self.audit_logger.log_strategy_selected(
            case_id=case_id,
            selected_strategy=selected,
            all_scores=[],
            reasoning="Human selection"
        )

        case = await self.get_case(case_id)
        return case

    async def confirm_human_decision(
        self,
        case_id: str,
        action: str,
        reviewer_id: str,
        reviewer_name: Optional[str] = None,
        reason: Optional[str] = None,
        override_status: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Confirm a human decision at the decision gate.

        This is the critical human-in-the-loop checkpoint that implements
        the Anthropic skill pattern. The case cannot progress past
        AWAITING_HUMAN_DECISION without this explicit confirmation.

        Args:
            case_id: Case identifier
            action: Decision action (approve, reject, override, escalate)
            reviewer_id: ID of the human reviewer
            reviewer_name: Optional name of the reviewer
            reason: Reason for rejection or override
            override_status: New status if overriding
            notes: Additional notes from reviewer

        Returns:
            Updated case data with decision recorded
        """
        logger.info(
            "Confirming human decision",
            case_id=case_id,
            action=action,
            reviewer=reviewer_id
        )

        # Validate action
        try:
            decision_action = HumanDecisionAction(action)
        except ValueError:
            raise ValueError(f"Invalid action: {action}. Must be one of: approve, reject, override, escalate")

        # Get current case
        case_dict = await self.get_case(case_id)
        if not case_dict:
            raise ValueError(f"Case not found: {case_id}")

        current_stage = case_dict.get("stage")
        if current_stage != CaseStage.AWAITING_HUMAN_DECISION.value:
            raise ValueError(
                f"Case is not awaiting human decision. Current stage: {current_stage}"
            )

        # Create human decision record
        human_decision = HumanDecision(
            stage=current_stage,
            action=decision_action,
            reviewer_id=reviewer_id,
            reviewer_name=reviewer_name,
            original_recommendation=case_dict.get("human_decision_reason"),
            override_reason=reason if decision_action in [HumanDecisionAction.REJECT, HumanDecisionAction.OVERRIDE] else None,
            notes=notes
        )

        # Get existing decisions
        existing_decisions = case_dict.get("human_decisions", [])
        existing_decisions.append(serialize_for_json(human_decision))

        # Determine next stage based on action
        if decision_action == HumanDecisionAction.APPROVE:
            next_stage = CaseStage.STRATEGY_GENERATION.value
            change_description = f"Human approved - proceeding to strategy generation"
        elif decision_action == HumanDecisionAction.SUBMIT_TO_PAYER:
            next_stage = CaseStage.STRATEGY_GENERATION.value
            change_description = "Human chose to submit to payer - proceeding to strategy generation"
        elif decision_action == HumanDecisionAction.FOLLOW_RECOMMENDATION:
            next_stage = CaseStage.STRATEGY_GENERATION.value
            change_description = "Human accepted AI recommendation - proceeding to strategy generation"
        elif decision_action == HumanDecisionAction.RETURN_TO_PROVIDER:
            next_stage = CaseStage.COMPLETED.value
            change_description = f"Returned to provider for additional documentation: {reason or notes or 'See AI recommendation'}"
        elif decision_action == HumanDecisionAction.REJECT:
            next_stage = CaseStage.FAILED.value
            change_description = f"Human rejected: {reason or 'No reason provided'}"
        elif decision_action == HumanDecisionAction.OVERRIDE:
            next_stage = CaseStage.STRATEGY_GENERATION.value
            change_description = f"Human override: {reason or 'Status overridden'}"
        elif decision_action == HumanDecisionAction.ESCALATE:
            # Stay in awaiting state but mark for escalation
            next_stage = CaseStage.AWAITING_HUMAN_DECISION.value
            change_description = f"Escalated for senior review by {reviewer_id}"
        else:
            next_stage = CaseStage.AWAITING_HUMAN_DECISION.value
            change_description = "Human decision recorded"

        # Update case
        await self.repository.update(
            case_id=case_id,
            updates={
                "stage": next_stage,
                "human_decisions": existing_decisions,
                "requires_human_decision": decision_action == HumanDecisionAction.ESCALATE,
                "human_decision_reason": reason if decision_action == HumanDecisionAction.ESCALATE else None,
            },
            change_description=change_description
        )

        # Log audit event with actual reviewer attribution
        await self.audit_logger.log_event(
            case_id=case_id,
            event_type=EventType.STAGE_CHANGED,
            decision_made=f"Human decision: {action}",
            reasoning=reason or f"Decision by {reviewer_id}",
            stage=next_stage,
            input_data={
                "action": action,
                "reviewer_id": reviewer_id,
                "reviewer_name": reviewer_name,
                "notes": notes
            },
            actor=reviewer_id,
        )

        logger.info(
            "Human decision confirmed",
            case_id=case_id,
            action=action,
            next_stage=next_stage
        )

        # Write decision waypoint if enabled
        if self.write_waypoints and self.waypoint_writer:
            try:
                await self._write_decision_waypoint(
                    case_id=case_id,
                    case_dict=case_dict,
                    human_decision=human_decision,
                    final_status=next_stage,
                    decision_action=decision_action
                )
            except Exception as e:
                logger.warning("Failed to write decision waypoint", error=str(e))

        # Return updated case
        case = await self.get_case(case_id)
        return case

    async def _write_decision_waypoint(
        self,
        case_id: str,
        case_dict: Dict[str, Any],
        human_decision: HumanDecision,
        final_status: str,
        decision_action: HumanDecisionAction
    ) -> None:
        """
        Write decision waypoint and notification letter after human decision.

        Args:
            case_id: Case identifier
            case_dict: Case data dictionary
            human_decision: Human decision record
            final_status: Final case status/stage
            decision_action: The action taken (approve, reject, etc.)
        """
        if not self.waypoint_writer:
            return

        # Get assessment waypoint reference
        assessment_path = self.waypoint_writer.get_waypoint_path(case_id, "assessment")
        assessment_reference = str(assessment_path) if assessment_path.exists() else None

        # Build audit trail from case history
        audit_trail = case_dict.get("human_decisions", [])

        # Map decision action to final status string for waypoint
        if decision_action == HumanDecisionAction.APPROVE:
            status_for_waypoint = "approved"
        elif decision_action == HumanDecisionAction.REJECT:
            status_for_waypoint = "denied"
        elif decision_action == HumanDecisionAction.OVERRIDE:
            status_for_waypoint = "approved"  # Override typically leads to approval
        else:
            status_for_waypoint = "pended"

        # Generate authorization number for approvals
        authorization_number = None
        if status_for_waypoint == "approved":
            import uuid
            authorization_number = f"AUTH-{uuid.uuid4().hex[:8].upper()}"

        # Build human decision dict for waypoint
        human_decision_dict = {
            "action": human_decision.action.value,
            "reviewer_id": human_decision.reviewer_id,
            "reviewer_name": human_decision.reviewer_name,
            "timestamp": human_decision.timestamp.isoformat() if human_decision.timestamp else datetime.now(timezone.utc).isoformat(),
            "original_recommendation": human_decision.original_recommendation,
            "override_reason": human_decision.override_reason,
            "notes": human_decision.notes
        }

        # Get documentation requests for pended cases
        documentation_requests = None
        if status_for_waypoint == "pended":
            gaps = case_dict.get("documentation_gaps", [])
            documentation_requests = [
                gap.get("description", "Additional documentation needed")
                for gap in gaps[:5]  # Limit to top 5 gaps
            ]

        # Write decision waypoint
        decision_path = self.waypoint_writer.write_decision_waypoint(
            case_id=case_id,
            assessment_reference=assessment_reference,
            human_decision=human_decision_dict,
            final_status=status_for_waypoint,
            authorization_number=authorization_number,
            documentation_requests=documentation_requests,
            audit_trail=audit_trail
        )

        logger.info(
            "Decision waypoint written",
            case_id=case_id,
            status=status_for_waypoint,
            path=str(decision_path)
        )

        # Generate notification letter for final decisions
        if status_for_waypoint in ["approved", "denied", "pended"]:
            await self._write_notification_letter(
                case_id=case_id,
                case_dict=case_dict,
                decision=status_for_waypoint,
                authorization_number=authorization_number,
                documentation_requests=documentation_requests
            )

    async def _write_notification_letter(
        self,
        case_id: str,
        case_dict: Dict[str, Any],
        decision: str,
        authorization_number: Optional[str] = None,
        documentation_requests: Optional[list] = None
    ) -> None:
        """
        Write notification letter after decision is finalized.

        Args:
            case_id: Case identifier
            case_dict: Case data dictionary
            decision: Decision (approved, denied, pend)
            authorization_number: Auth number if approved
            documentation_requests: Documents needed if pended
        """
        if not self.waypoint_writer:
            return

        # Extract required information from case
        patient_info = case_dict.get("patient", {})
        medication_info = case_dict.get("medication", {})

        # Get provider info
        provider_name = medication_info.get("prescriber_name", "Provider")
        provider_npi = medication_info.get("prescriber_npi", "Unknown")

        # Get patient info
        patient_name = f"{patient_info.get('first_name', '')} {patient_info.get('last_name', '')}".strip()
        patient_dob = patient_info.get("date_of_birth", "Unknown")

        # Get medication info
        medication_name = medication_info.get("medication_name", "Medication")

        # Get denial reason if applicable
        denial_reason = None
        if decision == "denied":
            # Get reason from coverage assessments
            assessments = case_dict.get("coverage_assessments", {})
            for payer, assessment in assessments.items():
                if assessment.get("coverage_status") in ["not_covered", "requires_human_review"]:
                    denial_reason = assessment.get("approval_likelihood_reasoning", "Does not meet coverage criteria")
                    break
            if not denial_reason:
                denial_reason = "Does not meet coverage criteria per policy review"

        # Calculate appeal deadline (30 days from now for denials)
        appeal_deadline = None
        if decision == "denied":
            from datetime import timedelta
            appeal_deadline = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%B %d, %Y")

        # Write notification letter
        notification_path = self.waypoint_writer.write_notification_letter(
            case_id=case_id,
            provider_name=provider_name,
            provider_npi=provider_npi,
            patient_name=patient_name,
            patient_dob=patient_dob,
            medication_name=medication_name,
            decision=decision,
            authorization_number=authorization_number,
            denial_reason=denial_reason,
            documentation_needed=documentation_requests,
            appeal_deadline=appeal_deadline
        )

        logger.info(
            "Notification letter written",
            case_id=case_id,
            decision=decision,
            path=str(notification_path)
        )

    async def check_human_decision_required(self, case_id: str) -> Dict[str, Any]:
        """
        Check if a case requires human decision.

        Args:
            case_id: Case identifier

        Returns:
            Dict with requires_decision, reason, and current_assessment
        """
        case_dict = await self.get_case(case_id)
        if not case_dict:
            raise ValueError(f"Case not found: {case_id}")

        stage = case_dict.get("stage")
        requires = stage == CaseStage.AWAITING_HUMAN_DECISION.value

        return {
            "case_id": case_id,
            "requires_decision": requires,
            "stage": stage,
            "reason": case_dict.get("human_decision_reason") if requires else None,
            "coverage_assessments": case_dict.get("coverage_assessments") if requires else None,
            "previous_decisions": case_dict.get("human_decisions", [])
        }
