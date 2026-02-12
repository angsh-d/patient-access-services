"""Policy analyzer agent with iterative refinement for coverage assessment."""
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pathlib import Path

from backend.models.coverage import CoverageAssessment, CriterionAssessment
from backend.models.case_state import CaseState
from backend.reasoning.policy_reasoner import get_policy_reasoner
from backend.storage.waypoint_writer import get_waypoint_writer
from backend.config.logging_config import get_logger
from backend.config.settings import get_settings

logger = get_logger(__name__)

PATIENTS_DIR = Path(get_settings().patients_dir)

# Confidence threshold below which criteria trigger targeted re-evaluation
LOW_CONFIDENCE_THRESHOLD = 0.7

# Maximum refinement iterations to prevent unbounded loops
MAX_REFINEMENT_ITERATIONS = 2


class PolicyAnalyzerAgent:
    """
    Agent responsible for analyzing payer policies and assessing coverage.
    Uses Claude for policy reasoning - no fallback allowed.

    Implements an iterative reasoning loop:
      1. Evidence gap detection - scans patient data for documentation gaps before analysis
      2. Initial assessment via PolicyReasoner
      3. Targeted re-evaluation of low-confidence criteria with enriched context
      4. Reasoning chain logging for audit trail
    """

    def __init__(self, write_waypoints: bool = True):
        """
        Initialize the policy analyzer agent.

        Args:
            write_waypoints: Whether to write waypoint files (default True)
        """
        self.reasoner = get_policy_reasoner()
        self.write_waypoints = write_waypoints
        self.waypoint_writer = get_waypoint_writer() if write_waypoints else None
        logger.info("Policy analyzer agent initialized", waypoints=write_waypoints)

    async def analyze_all_payers(
        self,
        case_state: CaseState
    ) -> Dict[str, CoverageAssessment]:
        """
        Analyze coverage for all payers in the case.

        Args:
            case_state: Current case state

        Returns:
            Dictionary mapping payer names to coverage assessments
        """
        reasoning_chain: List[str] = []
        reasoning_chain.append(
            f"[PolicyAnalyzer] Starting analysis for case {case_state.case_id}"
        )
        logger.info("Analyzing all payers", case_id=case_state.case_id)

        assessments = {}
        patient = case_state.patient
        medication = case_state.medication

        if not patient or not medication:
            raise ValueError("Patient and medication data required for analysis")

        # Build data structures for analysis
        patient_info = {
            "patient_id": patient.patient_id,
            "name": f"{patient.first_name} {patient.last_name}",
            "date_of_birth": patient.date_of_birth,
            "diagnosis_codes": patient.diagnosis_codes,
            "allergies": patient.allergies,
            "contraindications": patient.contraindications,
            "prior_treatments": medication.prior_treatments,
            "lab_results": medication.supporting_labs,
        }

        # Enrich with full clinical context from patient data file
        raw_patient = self._load_raw_patient_data(patient.patient_id)
        if raw_patient:
            for key in (
                "pre_biologic_screening", "disease_activity", "clinical_history",
                "laboratory_results", "procedures", "documentation_gaps",
                "diagnoses", "prior_treatments",
            ):
                if key in raw_patient and key not in patient_info:
                    patient_info[key] = raw_patient[key]

        medication_info = {
            "medication_name": medication.medication_name,
            "generic_name": medication.generic_name,
            "ndc_code": medication.ndc_code,
            "dose": medication.dose,
            "frequency": medication.frequency,
            "route": medication.route,
            "duration": medication.duration,
            "diagnosis": medication.diagnosis,
            "icd10_code": medication.icd10_code,
            "prescriber_npi": medication.prescriber_npi,
            "prescriber_name": medication.prescriber_name,
            "clinical_rationale": medication.clinical_rationale
        }

        # --- Step 1: Evidence gap detection (LLM-first) ---
        evidence_warnings = await self._detect_evidence_gaps(patient_info, raw_patient)
        if evidence_warnings:
            gap_summary = "; ".join(evidence_warnings)
            reasoning_chain.append(
                f"[PolicyAnalyzer] Evidence gap scan found {len(evidence_warnings)} warning(s): {gap_summary}"
            )
            logger.warning(
                "Evidence gaps detected before policy analysis",
                case_id=case_state.case_id,
                gap_count=len(evidence_warnings),
                gaps=evidence_warnings,
            )
        else:
            reasoning_chain.append(
                "[PolicyAnalyzer] Evidence gap scan: no documentation issues detected"
            )

        # --- Step 2: Initial assessment per payer ---
        payers_to_analyze = list(case_state.payer_states.keys())

        for payer_name in payers_to_analyze:
            try:
                reasoning_chain.append(
                    f"[PolicyAnalyzer] Running initial coverage assessment for {payer_name}"
                )

                assessment = await self.reasoner.assess_coverage(
                    patient_info=patient_info,
                    medication_info=medication_info,
                    payer_name=payer_name
                )

                logger.info(
                    "Initial payer analysis complete",
                    payer=payer_name,
                    status=assessment.coverage_status.value,
                    likelihood=assessment.approval_likelihood,
                )

                reasoning_chain.append(
                    f"[PolicyAnalyzer] {payer_name} initial result: "
                    f"status={assessment.coverage_status.value}, "
                    f"likelihood={assessment.approval_likelihood:.0%}, "
                    f"criteria={assessment.criteria_met_count}/{assessment.criteria_total_count}"
                )

                # --- Step 3: Iterative refinement for low-confidence criteria ---
                assessment = await self._iterative_refinement(
                    assessment=assessment,
                    patient_info=patient_info,
                    medication_info=medication_info,
                    payer_name=payer_name,
                    evidence_warnings=evidence_warnings,
                    reasoning_chain=reasoning_chain,
                )

                assessments[payer_name] = assessment

                logger.info(
                    "Payer analysis complete (post-refinement)",
                    payer=payer_name,
                    status=assessment.coverage_status.value,
                    likelihood=assessment.approval_likelihood,
                )

            except Exception as e:
                logger.error(
                    "Payer analysis failed",
                    payer=payer_name,
                    error=str(e)
                )
                # Don't swallow error - policy analysis is critical
                raise

        # --- Step 4: Log final reasoning chain ---
        reasoning_chain.append(
            f"[PolicyAnalyzer] Analysis complete for {len(assessments)} payer(s)"
        )

        # Attach reasoning chain to case_state messages if available
        if hasattr(case_state, 'messages') and isinstance(getattr(case_state, 'messages', None), list):
            case_state.messages.extend(reasoning_chain)

        # Store reasoning chain on the assessments for downstream consumers
        for payer_name, assessment in assessments.items():
            if assessment.llm_raw_response is None:
                assessment.llm_raw_response = {}
            assessment.llm_raw_response["reasoning_chain"] = reasoning_chain

        logger.info(
            "Full reasoning chain recorded",
            case_id=case_state.case_id,
            chain_length=len(reasoning_chain),
        )

        # Write assessment waypoint if enabled
        if self.write_waypoints and self.waypoint_writer and assessments:
            try:
                self._write_assessment_waypoint(
                    case_state=case_state,
                    assessments=assessments,
                    patient_info=patient_info,
                    medication_info=medication_info
                )
            except Exception as e:
                logger.warning("Failed to write assessment waypoint", error=str(e))

        return assessments

    # ------------------------------------------------------------------
    # Evidence gap detection
    # ------------------------------------------------------------------

    async def _detect_evidence_gaps(
        self,
        patient_info: Dict[str, Any],
        raw_patient: Optional[Dict[str, Any]],
    ) -> List[str]:
        """
        Scan patient data for documentation gaps using LLM analysis.

        Uses the evidence_gap_detection prompt to identify missing labs,
        pending screenings, outdated records, and known documentation gaps.

        Returns:
            List of human-readable warning strings for the reasoning chain.
        """
        from backend.models.enums import TaskCategory
        from backend.reasoning.llm_gateway import get_llm_gateway
        from backend.reasoning.prompt_loader import get_prompt_loader

        prompt_loader = get_prompt_loader()
        llm_gateway = get_llm_gateway()

        prompt = prompt_loader.load(
            "policy_analysis/evidence_gap_detection.txt",
            {
                "patient_info": json.dumps(patient_info, indent=2, default=str),
                "raw_patient": json.dumps(raw_patient, indent=2, default=str) if raw_patient else "No raw patient record available",
            },
        )

        result = await llm_gateway.generate(
            task_category=TaskCategory.DATA_EXTRACTION,
            prompt=prompt,
            temperature=0.0,
            response_format="json",
        )

        warnings = result.get("evidence_warnings", [])

        logger.info(
            "Evidence gap detection complete (LLM)",
            warning_count=len(warnings),
            readiness=result.get("overall_readiness", "unknown"),
        )

        return warnings

    # ------------------------------------------------------------------
    # Iterative refinement loop
    # ------------------------------------------------------------------

    async def _iterative_refinement(
        self,
        assessment: CoverageAssessment,
        patient_info: Dict[str, Any],
        medication_info: Dict[str, Any],
        payer_name: str,
        evidence_warnings: List[str],
        reasoning_chain: List[str],
    ) -> CoverageAssessment:
        """
        Check for low-confidence criteria and attempt targeted re-evaluation.

        If any criterion in the initial assessment has confidence < LOW_CONFIDENCE_THRESHOLD,
        triggers a re-assessment with additional context highlighting those specific criteria,
        up to MAX_REFINEMENT_ITERATIONS times.

        Args:
            assessment: The initial coverage assessment
            patient_info: Patient demographic and clinical data
            medication_info: Medication request details
            payer_name: Name of the payer
            evidence_warnings: Evidence gap warnings from pre-scan
            reasoning_chain: Mutable list accumulating reasoning steps

        Returns:
            Refined CoverageAssessment (or the original if no refinement needed)
        """
        current_assessment = assessment

        for iteration in range(1, MAX_REFINEMENT_ITERATIONS + 1):
            low_confidence_criteria = self._find_low_confidence_criteria(current_assessment)

            if not low_confidence_criteria:
                reasoning_chain.append(
                    f"[PolicyAnalyzer] {payer_name} refinement iteration {iteration}: "
                    "all criteria above confidence threshold - no refinement needed"
                )
                break

            criteria_names = [c.criterion_name for c in low_confidence_criteria]
            criteria_details = [
                f"{c.criterion_name} (confidence={c.confidence:.2f}, met={c.is_met})"
                for c in low_confidence_criteria
            ]

            reasoning_chain.append(
                f"[PolicyAnalyzer] {payer_name} refinement iteration {iteration}: "
                f"{len(low_confidence_criteria)} low-confidence criteria detected: "
                f"{', '.join(criteria_details)}"
            )

            logger.info(
                "Low-confidence criteria detected, triggering re-evaluation",
                payer=payer_name,
                iteration=iteration,
                low_confidence_count=len(low_confidence_criteria),
                criteria=criteria_names,
            )

            # Build targeted additional context for the re-evaluation
            refinement_context = self._build_refinement_context(
                low_confidence_criteria=low_confidence_criteria,
                evidence_warnings=evidence_warnings,
                current_assessment=current_assessment,
                iteration=iteration,
            )

            try:
                refined_assessment = await self.reasoner.assess_coverage(
                    patient_info=patient_info,
                    medication_info=medication_info,
                    payer_name=payer_name,
                    skip_cache=True,
                    historical_context=refinement_context,
                )

                # Merge: only accept refined criteria if their confidence improved
                current_assessment = self._merge_refined_assessment(
                    original=current_assessment,
                    refined=refined_assessment,
                    targeted_criteria_names=criteria_names,
                    reasoning_chain=reasoning_chain,
                    payer_name=payer_name,
                    iteration=iteration,
                )

            except Exception as e:
                reasoning_chain.append(
                    f"[PolicyAnalyzer] {payer_name} refinement iteration {iteration} failed: {str(e)} - "
                    "keeping original assessment"
                )
                logger.warning(
                    "Refinement re-evaluation failed, keeping original assessment",
                    payer=payer_name,
                    iteration=iteration,
                    error=str(e),
                )
                break

        return current_assessment

    def _find_low_confidence_criteria(
        self, assessment: CoverageAssessment
    ) -> List[CriterionAssessment]:
        """Return criteria with confidence below the threshold."""
        return [
            c for c in assessment.criteria_assessments
            if c.confidence < LOW_CONFIDENCE_THRESHOLD
        ]

    def _build_refinement_context(
        self,
        low_confidence_criteria: List[CriterionAssessment],
        evidence_warnings: List[str],
        current_assessment: CoverageAssessment,
        iteration: int,
    ) -> str:
        """
        Build additional context string for targeted re-evaluation.

        This is passed as `historical_context` to the PolicyReasoner, which inserts
        it into the prompt as a context-only section.
        """
        parts = []

        parts.append(
            f"## Targeted Re-evaluation (Iteration {iteration})\n"
            "The following criteria had low confidence in the initial assessment and require "
            "closer examination. Focus your analysis on these specific criteria, paying careful "
            "attention to any available evidence that may have been overlooked.\n"
        )

        for criterion in low_confidence_criteria:
            evidence_str = "; ".join(criterion.supporting_evidence) if criterion.supporting_evidence else "none found"
            gaps_str = "; ".join(criterion.gaps) if criterion.gaps else "none identified"
            parts.append(
                f"- **{criterion.criterion_name}** (ID: {criterion.criterion_id}): "
                f"confidence={criterion.confidence:.2f}, met={criterion.is_met}\n"
                f"  Initial reasoning: {criterion.reasoning}\n"
                f"  Evidence found: {evidence_str}\n"
                f"  Gaps: {gaps_str}"
            )

        if evidence_warnings:
            parts.append(
                "\n## Known Documentation Gaps (Pre-Analysis Scan)\n"
                "The following evidence gaps were detected in the patient record before analysis:\n"
                + "\n".join(f"- {w}" for w in evidence_warnings)
            )

        return "\n\n".join(parts)

    def _merge_refined_assessment(
        self,
        original: CoverageAssessment,
        refined: CoverageAssessment,
        targeted_criteria_names: List[str],
        reasoning_chain: List[str],
        payer_name: str,
        iteration: int,
    ) -> CoverageAssessment:
        """
        Merge refined assessment results back into the original.

        Only accepts refined criterion results when confidence improved for the
        targeted criteria. Overall assessment fields (likelihood, status, gaps,
        recommendations) are taken from the refined assessment since the LLM
        re-evaluated holistically.
        """
        # Build lookup of refined criteria by name
        refined_by_name: Dict[str, CriterionAssessment] = {
            c.criterion_name: c for c in refined.criteria_assessments
        }

        merged_criteria: List[CriterionAssessment] = []
        improvements = 0
        kept_original = 0

        for orig_criterion in original.criteria_assessments:
            if orig_criterion.criterion_name in targeted_criteria_names:
                refined_criterion = refined_by_name.get(orig_criterion.criterion_name)
                if refined_criterion and refined_criterion.confidence > orig_criterion.confidence:
                    merged_criteria.append(refined_criterion)
                    improvements += 1
                    logger.info(
                        "Criterion confidence improved via refinement",
                        payer=payer_name,
                        criterion=orig_criterion.criterion_name,
                        old_confidence=orig_criterion.confidence,
                        new_confidence=refined_criterion.confidence,
                    )
                else:
                    merged_criteria.append(orig_criterion)
                    kept_original += 1
            else:
                # Non-targeted criteria: keep original
                merged_criteria.append(orig_criterion)

        reasoning_chain.append(
            f"[PolicyAnalyzer] {payer_name} refinement iteration {iteration} merge: "
            f"{improvements} criteria improved, {kept_original} kept from original"
        )

        # Use refined overall assessment if any criteria improved
        if improvements > 0:
            result = refined.model_copy()
            result.criteria_assessments = merged_criteria
            result.criteria_met_count = sum(1 for c in merged_criteria if c.is_met)
            result.criteria_total_count = len(merged_criteria)
            return result
        else:
            reasoning_chain.append(
                f"[PolicyAnalyzer] {payer_name} refinement iteration {iteration}: "
                "no confidence improvements - keeping original assessment"
            )
            return original

    # ------------------------------------------------------------------
    # Existing methods (unchanged interfaces)
    # ------------------------------------------------------------------

    def _write_assessment_waypoint(
        self,
        case_state: CaseState,
        assessments: Dict[str, CoverageAssessment],
        patient_info: Dict[str, Any],
        medication_info: Dict[str, Any]
    ) -> Optional[Path]:
        """
        Write assessment waypoint file after analysis.

        Args:
            case_state: Current case state
            assessments: Coverage assessments by payer
            patient_info: Patient information dict
            medication_info: Medication information dict

        Returns:
            Path to waypoint file or None
        """
        if not self.waypoint_writer:
            return None

        # Find best assessment for recommendation
        best_payer = max(
            assessments.keys(),
            key=lambda p: assessments[p].approval_likelihood
        )
        best_assessment = assessments[best_payer]

        # Determine AI recommendation
        status = best_assessment.coverage_status.value
        if status in ["covered", "likely_covered"]:
            ai_recommendation = "APPROVE"
        elif status in ["requires_pa", "conditional", "pend"]:
            ai_recommendation = "PEND"
        else:
            ai_recommendation = "REQUIRES_HUMAN_REVIEW"

        # Build reasoning summary
        reasoning = f"Analysis of {len(assessments)} payer(s). "
        reasoning += f"Best option: {best_payer} with {best_assessment.approval_likelihood:.0%} approval likelihood. "
        reasoning += f"Status: {status}. "
        reasoning += f"Criteria met: {best_assessment.criteria_met_count}/{best_assessment.criteria_total_count}. "

        if best_assessment.documentation_gaps:
            reasoning += f"Identified {len(best_assessment.documentation_gaps)} documentation gap(s)."

        # Convert assessments to dicts
        assessments_dict = {
            payer: {
                "status": a.coverage_status.value,
                "likelihood": a.approval_likelihood,
                "criteria_met": a.criteria_met_count,
                "criteria_total": a.criteria_total_count,
                "gaps": [g.model_dump() for g in a.documentation_gaps]
            }
            for payer, a in assessments.items()
        }

        # Get all gaps
        all_gaps = self.get_all_documentation_gaps(assessments)

        return self.waypoint_writer.write_assessment_waypoint(
            case_id=case_state.case_id,
            patient_info={
                "patient_id": case_state.patient.patient_id,
                "first_name": case_state.patient.first_name,
                "last_name": case_state.patient.last_name,
                "primary_payer": case_state.patient.primary_payer,
                "secondary_payer": case_state.patient.secondary_payer,
                "diagnosis_codes": case_state.patient.diagnosis_codes
            },
            medication_info={
                "medication_name": medication_info.get("medication_name"),
                "dose": medication_info.get("dose"),
                "diagnosis": medication_info.get("diagnosis"),
                "icd10_code": medication_info.get("icd10_code"),
                "prescriber_npi": medication_info.get("prescriber_npi")
            },
            coverage_assessments=assessments_dict,
            documentation_gaps=all_gaps,
            ai_recommendation=ai_recommendation,
            confidence_score=best_assessment.approval_likelihood,
            reasoning=reasoning
        )

    async def analyze_single_payer(
        self,
        case_state: CaseState,
        payer_name: str
    ) -> CoverageAssessment:
        """
        Analyze coverage for a specific payer.

        Args:
            case_state: Current case state
            payer_name: Name of payer to analyze

        Returns:
            Coverage assessment for the payer
        """
        logger.info(
            "Analyzing single payer",
            case_id=case_state.case_id,
            payer=payer_name
        )

        patient = case_state.patient
        medication = case_state.medication

        if not patient or not medication:
            raise ValueError("Patient and medication data required")

        patient_info = {
            "patient_id": patient.patient_id,
            "name": f"{patient.first_name} {patient.last_name}",
            "date_of_birth": patient.date_of_birth,
            "diagnosis_codes": patient.diagnosis_codes,
            "allergies": patient.allergies,
            "contraindications": patient.contraindications,
            "prior_treatments": medication.prior_treatments,
            "lab_results": medication.supporting_labs,
        }

        # Enrich with full clinical context from patient data file
        # so the LLM can identify documentation gaps (e.g. TB/Hep B screenings)
        raw_patient = self._load_raw_patient_data(patient.patient_id)
        if raw_patient:
            for key in (
                "pre_biologic_screening", "disease_activity", "clinical_history",
                "laboratory_results", "procedures", "documentation_gaps",
                "diagnoses", "prior_treatments",
            ):
                if key in raw_patient and key not in patient_info:
                    patient_info[key] = raw_patient[key]

        medication_info = {
            "medication_name": medication.medication_name,
            "generic_name": medication.generic_name,
            "ndc_code": medication.ndc_code,
            "dose": medication.dose,
            "frequency": medication.frequency,
            "route": medication.route,
            "duration": medication.duration,
            "diagnosis": medication.diagnosis,
            "icd10_code": medication.icd10_code,
            "prescriber_npi": medication.prescriber_npi,
            "prescriber_name": medication.prescriber_name,
            "clinical_rationale": medication.clinical_rationale
        }

        # Evidence gap detection (LLM-first)
        evidence_warnings = await self._detect_evidence_gaps(patient_info, raw_patient)
        if evidence_warnings:
            logger.warning(
                "Evidence gaps detected for single-payer analysis",
                case_id=case_state.case_id,
                payer=payer_name,
                gap_count=len(evidence_warnings),
                gaps=evidence_warnings,
            )

        # Initial assessment
        assessment = await self.reasoner.assess_coverage(
            patient_info=patient_info,
            medication_info=medication_info,
            payer_name=payer_name
        )

        # Iterative refinement
        reasoning_chain: List[str] = []
        assessment = await self._iterative_refinement(
            assessment=assessment,
            patient_info=patient_info,
            medication_info=medication_info,
            payer_name=payer_name,
            evidence_warnings=evidence_warnings,
            reasoning_chain=reasoning_chain,
        )

        if reasoning_chain:
            logger.info(
                "Single-payer reasoning chain",
                case_id=case_state.case_id,
                payer=payer_name,
                chain=reasoning_chain,
            )

        return assessment

    def compare_assessments(
        self,
        assessments: Dict[str, CoverageAssessment]
    ) -> Dict[str, Any]:
        """
        Compare assessments across payers.

        Args:
            assessments: Dictionary of payer assessments

        Returns:
            Comparison summary
        """
        if not assessments:
            return {"error": "No assessments to compare"}

        comparison = {
            "payer_count": len(assessments),
            "assessments": {},
            "best_likelihood": None,
            "best_payer": None,
            "total_gaps": 0
        }

        best_likelihood = -1.0
        best_payer = None

        for payer_name, assessment in assessments.items():
            comparison["assessments"][payer_name] = {
                "status": assessment.coverage_status.value,
                "likelihood": assessment.approval_likelihood,
                "criteria_met": f"{assessment.criteria_met_count}/{assessment.criteria_total_count}",
                "gaps_count": len(assessment.documentation_gaps),
                "step_therapy_required": assessment.step_therapy_required,
                "step_therapy_satisfied": assessment.step_therapy_satisfied
            }

            comparison["total_gaps"] += len(assessment.documentation_gaps)

            if assessment.approval_likelihood > best_likelihood:
                best_likelihood = assessment.approval_likelihood
                best_payer = payer_name

        comparison["best_likelihood"] = best_likelihood
        comparison["best_payer"] = best_payer

        logger.info(
            "Assessment comparison",
            best_payer=best_payer,
            best_likelihood=best_likelihood,
            total_gaps=comparison["total_gaps"]
        )

        return comparison

    def get_all_documentation_gaps(
        self,
        assessments: Dict[str, CoverageAssessment]
    ) -> List[Dict[str, Any]]:
        """
        Aggregate documentation gaps from all assessments.

        Args:
            assessments: Dictionary of payer assessments

        Returns:
            List of all unique documentation gaps
        """
        all_gaps = []
        seen_gap_ids = set()

        for payer_name, assessment in assessments.items():
            for gap in assessment.documentation_gaps:
                # Avoid duplicates
                if gap.gap_id not in seen_gap_ids:
                    seen_gap_ids.add(gap.gap_id)
                    all_gaps.append({
                        "gap_id": gap.gap_id,
                        "gap_type": gap.gap_type,
                        "description": gap.description,
                        "priority": gap.priority,
                        "required_for": gap.required_for,
                        "suggested_action": gap.suggested_action,
                        "payers_affected": [payer_name]
                    })
                else:
                    # Add this payer to existing gap
                    for existing in all_gaps:
                        if existing["gap_id"] == gap.gap_id:
                            existing["payers_affected"].append(payer_name)
                            break

        # Sort by priority
        priority_order = {"high": 0, "medium": 1, "low": 2}
        all_gaps.sort(key=lambda g: priority_order.get(g["priority"], 99))

        return all_gaps

    @staticmethod
    def _load_raw_patient_data(patient_id: str) -> Optional[Dict[str, Any]]:
        """Load full raw patient JSON from data file for clinical context enrichment."""
        patient_file = PATIENTS_DIR / f"{patient_id}.json"
        if not patient_file.exists():
            return None
        try:
            with open(patient_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("Could not load raw patient data", patient_id=patient_id, error=str(e))
            return None


# Global instance
_policy_analyzer: Optional[PolicyAnalyzerAgent] = None


def get_policy_analyzer() -> PolicyAnalyzerAgent:
    """Get or create the global policy analyzer agent."""
    global _policy_analyzer
    if _policy_analyzer is None:
        _policy_analyzer = PolicyAnalyzerAgent()
    return _policy_analyzer
