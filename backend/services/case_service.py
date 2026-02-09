"""Case service for managing PA cases."""
from typing import Dict, Any, List, Optional
from datetime import datetime, date, timezone
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
            payers=list(case_state.payer_states.keys())
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
                "selected_strategy_id": final_state.get("selected_strategy", {}).get("strategy_id"),
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
            to_stage=final_state.get("stage", CaseStage.COMPLETED).value,
            reason=final_state.get("final_outcome", "Processing complete")
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
        elif stage == "strategy_generation":
            return await self._run_strategy_generation_stage(case_state)
        elif stage == "action_coordination":
            return await self._run_action_coordination_stage(case_state)
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

                return {
                    "stage": "policy_analysis",
                    "reasoning": reasoning,
                    "confidence": best_likelihood,
                    "findings": findings,
                    "recommendations": recommendations,
                    "warnings": [f"Documentation gap: {gap.get('description', gap) if isinstance(gap, dict) else gap}" for gap in all_gaps[:3]] if all_gaps else [],
                    "assessments": serialize_for_json(cached_assessments),
                    "documentation_gaps": all_gaps,
                }

        reasoner = get_policy_reasoner()
        payers = list(case_state.payer_states.keys())

        assessments = {}
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
                payer_name=payer
            )

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

        return {
            "stage": "policy_analysis",
            "reasoning": reasoning,
            "confidence": best_likelihood,
            "findings": findings,
            "recommendations": recommendations,
            "warnings": [f"Documentation gap: {gap['description']}" for gap in all_gaps[:3]] if all_gaps else [],
            "assessments": assessments,
            "documentation_gaps": all_gaps
        }

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
            payers=list(case_state.payer_states.keys())
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
        payers = list(case_state.payer_states.keys())

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
            "policy_analysis": CaseStage.STRATEGY_GENERATION,
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

        # Log audit event
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
            }
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
