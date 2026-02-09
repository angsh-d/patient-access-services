"""Policy analyzer agent for coverage assessment."""
import json
from typing import Dict, Any, List, Optional
from pathlib import Path

from backend.models.coverage import CoverageAssessment
from backend.models.case_state import CaseState
from backend.reasoning.policy_reasoner import get_policy_reasoner
from backend.storage.waypoint_writer import get_waypoint_writer
from backend.config.logging_config import get_logger
from backend.config.settings import get_settings

logger = get_logger(__name__)

PATIENTS_DIR = Path(get_settings().patients_dir)


class PolicyAnalyzerAgent:
    """
    Agent responsible for analyzing payer policies and assessing coverage.
    Uses Claude for policy reasoning - no fallback allowed.

    Generates waypoint outputs following Anthropic skill pattern.
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

        # Analyze each payer
        payers_to_analyze = list(case_state.payer_states.keys())

        for payer_name in payers_to_analyze:
            try:
                assessment = await self.reasoner.assess_coverage(
                    patient_info=patient_info,
                    medication_info=medication_info,
                    payer_name=payer_name
                )
                assessments[payer_name] = assessment

                logger.info(
                    "Payer analysis complete",
                    payer=payer_name,
                    status=assessment.coverage_status.value,
                    likelihood=assessment.approval_likelihood
                )

            except Exception as e:
                logger.error(
                    "Payer analysis failed",
                    payer=payer_name,
                    error=str(e)
                )
                # Don't swallow error - policy analysis is critical
                raise

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

        return await self.reasoner.assess_coverage(
            patient_info=patient_info,
            medication_info=medication_info,
            payer_name=payer_name
        )

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
