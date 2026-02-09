"""Waypoint Writer for file-based audit artifacts.

Following Anthropic's prior-auth-review-skill pattern, this module generates
file-based waypoint outputs for portable audit trails:
- waypoints/assessment_{case_id}.json - Subskill 1 output (policy analysis)
- waypoints/decision_{case_id}.json - Subskill 2 output (human decision)
- outputs/notification_{case_id}.txt - Provider notification letter
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List

from backend.config.logging_config import get_logger

logger = get_logger(__name__)

# Project root directory (parent of backend/)
PROJECT_ROOT = Path(__file__).parent.parent.parent


class WaypointWriter:
    """
    Writes waypoint files for audit trail documentation.

    Follows Anthropic skill pattern for generating portable,
    human-readable audit artifacts at each stage of processing.
    """

    def __init__(
        self,
        waypoints_dir: Optional[Path] = None,
        outputs_dir: Optional[Path] = None
    ):
        """
        Initialize the waypoint writer.

        Args:
            waypoints_dir: Directory for waypoint JSON files
            outputs_dir: Directory for notification letters
        """
        self.waypoints_dir = waypoints_dir or (PROJECT_ROOT / "waypoints")
        self.outputs_dir = outputs_dir or (PROJECT_ROOT / "outputs")

        # Ensure directories exist
        self.waypoints_dir.mkdir(parents=True, exist_ok=True)
        self.outputs_dir.mkdir(parents=True, exist_ok=True)

        logger.info(
            "Waypoint writer initialized",
            waypoints_dir=str(self.waypoints_dir),
            outputs_dir=str(self.outputs_dir)
        )

    def write_assessment_waypoint(
        self,
        case_id: str,
        patient_info: Dict[str, Any],
        medication_info: Dict[str, Any],
        coverage_assessments: Dict[str, Any],
        documentation_gaps: List[Dict[str, Any]],
        ai_recommendation: str,
        confidence_score: float,
        reasoning: str
    ) -> Path:
        """
        Write assessment waypoint (Subskill 1 output).

        This captures the AI's coverage analysis before human review.

        Args:
            case_id: Case identifier
            patient_info: Patient demographics and insurance
            medication_info: Medication request details
            coverage_assessments: Payer coverage assessments
            documentation_gaps: Identified documentation gaps
            ai_recommendation: AI's recommendation (APPROVE/PEND/REQUIRES_HUMAN_REVIEW)
            confidence_score: Confidence in recommendation (0.0-1.0)
            reasoning: AI's reasoning for the recommendation

        Returns:
            Path to the written waypoint file
        """
        waypoint = {
            "waypoint_type": "assessment",
            "version": "1.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "case_id": case_id,
            "stage": "policy_analysis_complete",

            # Input data
            "patient_summary": {
                "patient_id": patient_info.get("patient_id"),
                "name": f"{patient_info.get('first_name', '')} {patient_info.get('last_name', '')}".strip(),
                "primary_payer": patient_info.get("primary_payer"),
                "secondary_payer": patient_info.get("secondary_payer"),
                "diagnosis_codes": patient_info.get("diagnosis_codes", [])
            },
            "medication_summary": {
                "medication_name": medication_info.get("medication_name"),
                "dose": medication_info.get("dose"),
                "indication": medication_info.get("diagnosis"),
                "icd10_code": medication_info.get("icd10_code"),
                "prescriber_npi": medication_info.get("prescriber_npi")
            },

            # Analysis results
            "coverage_assessments": coverage_assessments,
            "documentation_gaps": documentation_gaps,

            # AI recommendation (before human review)
            "ai_analysis": {
                "recommendation": ai_recommendation,
                "confidence_score": confidence_score,
                "reasoning": reasoning,
                "disclaimer": "This is an AI-generated recommendation. Human review is required before any decision is finalized."
            },

            # Audit metadata
            "audit": {
                "model_used": "claude",
                "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
                "requires_human_decision": True
            }
        }

        file_path = self.waypoints_dir / f"assessment_{case_id}.json"
        self._write_json(file_path, waypoint)

        logger.info(
            "Assessment waypoint written",
            case_id=case_id,
            path=str(file_path)
        )

        return file_path

    def write_decision_waypoint(
        self,
        case_id: str,
        assessment_reference: str,
        human_decision: Dict[str, Any],
        final_status: str,
        authorization_number: Optional[str] = None,
        documentation_requests: Optional[List[str]] = None,
        audit_trail: Optional[List[Dict[str, Any]]] = None
    ) -> Path:
        """
        Write decision waypoint (Subskill 2 output).

        This captures the human decision and final outcome.

        Args:
            case_id: Case identifier
            assessment_reference: Reference to assessment waypoint
            human_decision: Human reviewer's decision details
            final_status: Final case status (approved, denied, pended)
            authorization_number: Auth number if approved
            documentation_requests: Documents needed if pended
            audit_trail: Complete decision audit trail

        Returns:
            Path to the written waypoint file
        """
        waypoint = {
            "waypoint_type": "decision",
            "version": "1.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "case_id": case_id,
            "stage": "human_decision_complete",

            # Reference to assessment
            "assessment_reference": assessment_reference,

            # Human decision details
            "human_decision": {
                "action": human_decision.get("action"),
                "reviewer_id": human_decision.get("reviewer_id"),
                "reviewer_name": human_decision.get("reviewer_name"),
                "timestamp": human_decision.get("timestamp"),
                "original_ai_recommendation": human_decision.get("original_recommendation"),
                "override_reason": human_decision.get("override_reason"),
                "notes": human_decision.get("notes")
            },

            # Final outcome
            "outcome": {
                "status": final_status,
                "authorization_number": authorization_number,
                "documentation_requests": documentation_requests or [],
                "effective_date": datetime.now(timezone.utc).isoformat() if final_status == "approved" else None
            },

            # Complete audit trail
            "audit_trail": audit_trail or [],

            # Compliance statement
            "compliance": {
                "human_in_the_loop": True,
                "ai_recommendation_reviewed": True,
                "decision_authority": "human_reviewer",
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        }

        file_path = self.waypoints_dir / f"decision_{case_id}.json"
        self._write_json(file_path, waypoint)

        logger.info(
            "Decision waypoint written",
            case_id=case_id,
            final_status=final_status,
            path=str(file_path)
        )

        return file_path

    def write_notification_letter(
        self,
        case_id: str,
        provider_name: str,
        provider_npi: str,
        patient_name: str,
        patient_dob: str,
        medication_name: str,
        decision: str,
        authorization_number: Optional[str] = None,
        denial_reason: Optional[str] = None,
        documentation_needed: Optional[List[str]] = None,
        appeal_deadline: Optional[str] = None
    ) -> Path:
        """
        Generate provider notification letter.

        Args:
            case_id: Case identifier
            provider_name: Prescribing provider name
            provider_npi: Provider NPI
            patient_name: Patient full name
            patient_dob: Patient date of birth
            medication_name: Requested medication
            decision: Decision (approved, denied, pend)
            authorization_number: Auth number if approved
            denial_reason: Reason if denied
            documentation_needed: Documents needed if pended
            appeal_deadline: Appeal deadline if denied

        Returns:
            Path to the notification letter
        """
        today = datetime.now(timezone.utc).strftime("%B %d, %Y")

        if decision.lower() == "approved":
            letter = self._generate_approval_letter(
                today, provider_name, provider_npi, patient_name, patient_dob,
                medication_name, authorization_number, case_id
            )
        elif decision.lower() == "pend":
            letter = self._generate_pend_letter(
                today, provider_name, provider_npi, patient_name, patient_dob,
                medication_name, documentation_needed or [], case_id
            )
        else:  # denied
            letter = self._generate_denial_letter(
                today, provider_name, provider_npi, patient_name, patient_dob,
                medication_name, denial_reason or "Does not meet coverage criteria",
                appeal_deadline, case_id
            )

        file_path = self.outputs_dir / f"notification_{case_id}.txt"
        file_path.write_text(letter)

        logger.info(
            "Notification letter written",
            case_id=case_id,
            decision=decision,
            path=str(file_path)
        )

        return file_path

    def _generate_approval_letter(
        self,
        date: str,
        provider_name: str,
        provider_npi: str,
        patient_name: str,
        patient_dob: str,
        medication_name: str,
        authorization_number: str,
        case_id: str
    ) -> str:
        """Generate approval notification letter."""
        return f"""PRIOR AUTHORIZATION APPROVAL NOTICE

Date: {date}
Case Reference: {case_id}

TO: {provider_name}
NPI: {provider_npi}

RE: Prior Authorization Request
Patient: {patient_name}
Date of Birth: {patient_dob}
Medication: {medication_name}

DECISION: APPROVED

Authorization Number: {authorization_number}

This letter confirms that the prior authorization request for the above-referenced medication has been APPROVED.

AUTHORIZATION DETAILS:
- Authorization Number: {authorization_number}
- Effective Date: {date}
- Duration: As prescribed, subject to plan terms

IMPORTANT NOTES:
- This authorization is valid for the medication, dose, and indication specified in the request
- Claims must include the authorization number for processing
- Coverage is subject to member eligibility at time of service

If you have questions regarding this authorization, please contact our Prior Authorization department.

This determination was made following a comprehensive review of medical necessity criteria.

---
Generated by: Agentic Access Strategy Platform
Case ID: {case_id}
"""

    def _generate_pend_letter(
        self,
        date: str,
        provider_name: str,
        provider_npi: str,
        patient_name: str,
        patient_dob: str,
        medication_name: str,
        documentation_needed: List[str],
        case_id: str
    ) -> str:
        """Generate pend notification letter."""
        docs_list = "\n".join(f"  - {doc}" for doc in documentation_needed) if documentation_needed else "  - Additional clinical documentation"

        return f"""PRIOR AUTHORIZATION - ADDITIONAL INFORMATION NEEDED

Date: {date}
Case Reference: {case_id}

TO: {provider_name}
NPI: {provider_npi}

RE: Prior Authorization Request - Information Needed
Patient: {patient_name}
Date of Birth: {patient_dob}
Medication: {medication_name}

STATUS: PENDED - ADDITIONAL DOCUMENTATION REQUIRED

We have received your prior authorization request for the above-referenced medication. To complete our review, we require the following additional documentation:

REQUIRED DOCUMENTATION:
{docs_list}

SUBMISSION INSTRUCTIONS:
- Please submit the requested documentation within 14 calendar days
- Reference Case ID: {case_id} on all submissions
- Fax to: [Payer Fax Number]
- Or upload via provider portal

IMPORTANT:
- Failure to provide documentation within the specified timeframe may result in denial
- You may contact our Prior Authorization department with questions

We will complete our review promptly upon receipt of the requested information.

---
Generated by: Agentic Access Strategy Platform
Case ID: {case_id}
"""

    def _generate_denial_letter(
        self,
        date: str,
        provider_name: str,
        provider_npi: str,
        patient_name: str,
        patient_dob: str,
        medication_name: str,
        denial_reason: str,
        appeal_deadline: Optional[str],
        case_id: str
    ) -> str:
        """Generate denial notification letter."""
        appeal_section = ""
        if appeal_deadline:
            appeal_section = f"""
APPEAL RIGHTS:
You have the right to appeal this determination. To appeal:
- Submit a written appeal by: {appeal_deadline}
- Include additional clinical documentation supporting medical necessity
- Request a peer-to-peer review with our Medical Director

Appeal Submission:
- Fax: [Payer Appeal Fax]
- Mail: [Payer Appeal Address]
- Reference Case ID: {case_id}
"""

        return f"""PRIOR AUTHORIZATION DENIAL NOTICE

Date: {date}
Case Reference: {case_id}

TO: {provider_name}
NPI: {provider_npi}

RE: Prior Authorization Request - Denial
Patient: {patient_name}
Date of Birth: {patient_dob}
Medication: {medication_name}

DECISION: NOT APPROVED

REASON FOR DETERMINATION:
{denial_reason}

This determination was made based on review of the submitted clinical documentation against our coverage criteria.
{appeal_section}
ALTERNATIVE OPTIONS:
- Review our coverage criteria for this medication class
- Consider formulary alternatives that may be covered
- Submit additional documentation that addresses the denial reason

If you have questions about this determination, please contact our Prior Authorization department.

This determination was reviewed and approved by a qualified healthcare professional.

---
Generated by: Agentic Access Strategy Platform
Case ID: {case_id}
"""

    def _write_json(self, path: Path, data: Dict[str, Any]) -> None:
        """Write JSON data to file with pretty formatting."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)

    def get_waypoint_path(self, case_id: str, waypoint_type: str) -> Path:
        """Get path to a waypoint file."""
        return self.waypoints_dir / f"{waypoint_type}_{case_id}.json"

    def get_notification_path(self, case_id: str) -> Path:
        """Get path to a notification letter."""
        return self.outputs_dir / f"notification_{case_id}.txt"

    def load_waypoint(self, case_id: str, waypoint_type: str) -> Optional[Dict[str, Any]]:
        """Load a waypoint file if it exists."""
        path = self.get_waypoint_path(case_id, waypoint_type)
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return None


# Global instance
_waypoint_writer: Optional[WaypointWriter] = None


def get_waypoint_writer() -> WaypointWriter:
    """Get or create the global waypoint writer instance."""
    global _waypoint_writer
    if _waypoint_writer is None:
        _waypoint_writer = WaypointWriter()
    return _waypoint_writer
