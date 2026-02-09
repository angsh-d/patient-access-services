"""Recovery agent for handling denials and setbacks."""
from typing import Dict, Any, List, Optional, Literal
from datetime import datetime
from uuid import uuid4

from backend.models.strategy import RecoveryStrategy, AppealStrategy
from backend.models.enums import TaskCategory
from backend.reasoning.llm_gateway import get_llm_gateway
from backend.reasoning.prompt_loader import get_prompt_loader
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class DenialClassification:
    """Classification of a denial for recovery planning."""

    def __init__(
        self,
        denial_type: Literal[
            "medical_necessity", "documentation_incomplete",
            "step_therapy", "prior_auth_expired", "not_covered", "other"
        ],
        is_recoverable: bool,
        root_cause: str,
        linked_intake_gap: Optional[str] = None,
        urgency: Literal["standard", "urgent", "emergent"] = "standard"
    ):
        self.denial_type = denial_type
        self.is_recoverable = is_recoverable
        self.root_cause = root_cause
        self.linked_intake_gap = linked_intake_gap
        self.urgency = urgency


class RecoveryAgent:
    """
    Agent responsible for handling denials and setbacks.

    Key capabilities:
    - Denial classification (categorize denial type)
    - Root cause analysis (link to intake gaps)
    - Recovery strategy generation (score multiple options)
    - Appeal strategy generation (using Claude)
    """

    def __init__(self):
        """Initialize the recovery agent."""
        self.llm_gateway = get_llm_gateway()
        self.prompt_loader = get_prompt_loader()
        logger.info("Recovery agent initialized")

    def classify_denial(
        self,
        denial_response: Dict[str, Any],
        case_state: Dict[str, Any]
    ) -> DenialClassification:
        """
        Classify a denial to determine recovery approach.

        Args:
            denial_response: Payer denial response
            case_state: Current case state (to find linked gaps)

        Returns:
            DenialClassification with recovery guidance
        """
        reason_code = denial_response.get("denial_reason_code") or denial_response.get("denial_code", "")
        reason_text = denial_response.get("denial_reason", "")
        appeal_deadline = denial_response.get("appeal_deadline")

        # Classify denial type
        denial_type = self._determine_denial_type(reason_code, reason_text)

        # Check if recoverable — doc_incomplete and prior_auth_expired are recoverable
        # even without an appeal_deadline (resubmission, not appeal)
        is_recoverable = (
            denial_type != "not_covered" and
            (appeal_deadline is not None or denial_type in ("documentation_incomplete", "prior_auth_expired"))
        )

        # Find root cause and linked intake gap (use evaluator results if available)
        payer_name = denial_response.get("payer_name", "")
        evaluation_result = None
        eval_results = case_state.get("policy_evaluation_results", {})
        if payer_name and payer_name in eval_results:
            evaluation_result = eval_results[payer_name]

        root_cause, linked_gap = self._analyze_root_cause(
            denial_type,
            reason_text,
            case_state.get("documentation_gaps", []),
            evaluation_result=evaluation_result,
        )

        # Determine urgency based on patient condition
        urgency = self._assess_urgency(case_state)

        classification = DenialClassification(
            denial_type=denial_type,
            is_recoverable=is_recoverable,
            root_cause=root_cause,
            linked_intake_gap=linked_gap,
            urgency=urgency
        )

        logger.info(
            "Denial classified",
            denial_type=denial_type,
            is_recoverable=is_recoverable,
            root_cause=root_cause,
            linked_gap=linked_gap
        )

        return classification

    def _determine_denial_type(
        self,
        reason_code: str,
        reason_text: str
    ) -> Literal["medical_necessity", "documentation_incomplete",
                  "step_therapy", "prior_auth_expired", "not_covered", "other"]:
        """Determine denial type from code and text."""
        reason_lower = reason_text.lower()
        code_upper = reason_code.upper()

        # Check multi-word specific phrases FIRST to avoid false matches from generic keywords
        if "medical necessity" in reason_lower or "MED_NEC" in code_upper:
            return "medical_necessity"
        elif "step therapy" in reason_lower or "step-therapy" in reason_lower or "STEP_THERAPY" in code_upper or "ST_REQ" in code_upper:
            return "step_therapy"
        elif "not covered" in reason_lower or "excluded" in reason_lower or "NOT_COVERED" in code_upper or "EXCLUDED" in code_upper:
            return "not_covered"
        elif "expired" in reason_lower or "EXPIRED" in code_upper:
            return "prior_auth_expired"
        # Generic single-word keywords last
        elif "missing" in reason_lower or "incomplete" in reason_lower or "documentation" in reason_lower:
            return "documentation_incomplete"
        else:
            return "other"

    def _analyze_root_cause(
        self,
        denial_type: str,
        reason_text: str,
        documentation_gaps: List[Dict[str, Any]],
        evaluation_result: Optional[Dict[str, Any]] = None,
    ) -> tuple:
        """Analyze root cause and find linked intake gap or criterion ID."""
        root_cause = reason_text

        # Try to link to an intake gap
        linked_gap = None
        reason_lower = reason_text.lower()

        # First, try to map to specific criterion IDs from evaluation result
        if evaluation_result and evaluation_result.get("gaps"):
            for gap in evaluation_result["gaps"]:
                gap_name = gap.get("criterion_name", "").lower()
                cid = gap.get("criterion_id", "")
                if any(kw in gap_name for kw in reason_lower.split() if len(kw) > 3):
                    linked_gap = cid
                    root_cause = f"Denial linked to criterion {cid}: {gap.get('criterion_name', '')}"
                    break

        # Fall back to documentation gaps
        if not linked_gap:
            for gap in documentation_gaps:
                gap_desc = gap.get("description", "").lower()
                gap_type = gap.get("gap_type", "").lower()

                if "tb" in reason_lower and "tb" in gap_desc:
                    linked_gap = gap.get("gap_id")
                    root_cause = f"Missing TB screening identified at intake (gap: {linked_gap})"
                    break
                elif "screening" in reason_lower and "screening" in gap_desc:
                    linked_gap = gap.get("gap_id")
                    root_cause = f"Missing screening identified at intake (gap: {linked_gap})"
                    break
                elif "step" in reason_lower and "step" in gap_type:
                    linked_gap = gap.get("gap_id")
                    root_cause = f"Step therapy gap identified at intake (gap: {linked_gap})"
                    break

        return root_cause, linked_gap

    def _assess_urgency(self, case_state: Dict[str, Any]) -> Literal["standard", "urgent", "emergent"]:
        """Assess urgency based on patient clinical status."""
        patient_data = case_state.get("patient_data", {})
        clinical = patient_data.get("clinical_profile", {})

        # Check for urgent indicators
        diagnoses = clinical.get("diagnoses", [])
        for dx in diagnoses:
            if dx.get("is_urgent") or "active" in dx.get("description", "").lower():
                return "urgent"

        return "standard"

    def generate_recovery_strategies(
        self,
        classification: DenialClassification,
        case_state: Dict[str, Any],
        payer_name: str
    ) -> List[Dict[str, Any]]:
        """
        Generate and score recovery strategy options.

        Args:
            classification: Denial classification
            case_state: Current case state
            payer_name: Payer that denied

        Returns:
            List of recovery options with scores
        """
        options = []

        if classification.denial_type == "documentation_incomplete":
            # Option 1: Urgent document chase
            options.append({
                "option_id": "URGENT_DOCUMENT_CHASE",
                "name": "Urgent Document Chase",
                "description": "Priority escalation to obtain missing documentation and resubmit",
                "score": 7.2,
                "actions": [
                    {"action": "escalate_to_provider", "priority": "urgent"},
                    {"action": "track_documentation", "deadline_hours": 48},
                    {"action": "resubmit_pa", "after": "documents_received"}
                ],
                "pros": ["Fastest path to approval if docs obtained", "No appeal needed"],
                "cons": ["Depends on provider responsiveness"],
                "success_probability": 0.85
            })

            # Option 2: Parallel recovery
            options.append({
                "option_id": "PARALLEL_RECOVERY",
                "name": "Parallel Recovery",
                "description": "Chase documentation AND prepare appeal simultaneously",
                "score": 6.8,
                "actions": [
                    {"action": "escalate_to_provider", "priority": "standard"},
                    {"action": "prepare_appeal", "parallel": True},
                    {"action": "submit_first_available"}
                ],
                "pros": ["Hedges risk", "Uses time efficiently"],
                "cons": ["More coordination effort"],
                "success_probability": 0.78
            })

        elif classification.denial_type == "medical_necessity":
            # Option 1: Peer-to-peer review
            options.append({
                "option_id": "PEER_TO_PEER_REVIEW",
                "name": "Peer-to-Peer Review",
                "description": "Request P2P review with payer medical director",
                "score": 7.5,
                "actions": [
                    {"action": "prepare_p2p_materials"},
                    {"action": "schedule_p2p", "urgency": classification.urgency},
                    {"action": "conduct_p2p"}
                ],
                "pros": ["High success rate for valid cases", "Fast turnaround"],
                "cons": ["Requires physician time"],
                "success_probability": 0.72
            })

            # Option 2: Written appeal
            options.append({
                "option_id": "WRITTEN_APPEAL",
                "name": "Written Appeal",
                "description": "Submit comprehensive written appeal with clinical evidence",
                "score": 6.5,
                "actions": [
                    {"action": "generate_appeal_strategy"},
                    {"action": "draft_appeal_letter"},
                    {"action": "submit_appeal"}
                ],
                "pros": ["Thorough documentation", "Creates audit trail"],
                "cons": ["Longer timeline"],
                "success_probability": 0.65
            })

        elif classification.denial_type == "step_therapy":
            # Option 1: Document step therapy completion
            options.append({
                "option_id": "DOCUMENT_STEP_THERAPY",
                "name": "Document Step Therapy Completion",
                "description": "Gather documentation showing required step therapy was completed or provide clinical justification for exception",
                "score": 7.0,
                "actions": [
                    {"action": "gather_treatment_history", "priority": "urgent"},
                    {"action": "document_step_therapy_compliance"},
                    {"action": "resubmit_pa", "after": "documentation_complete"}
                ],
                "pros": ["Addresses denial reason directly", "High success if history available"],
                "cons": ["Depends on prior treatment documentation"],
                "success_probability": 0.75
            })

            # Option 2: Step therapy exception request
            options.append({
                "option_id": "STEP_THERAPY_EXCEPTION",
                "name": "Request Step Therapy Exception",
                "description": "Appeal for step therapy exception based on clinical contraindication or prior failure",
                "score": 6.5,
                "actions": [
                    {"action": "prepare_exception_request"},
                    {"action": "submit_appeal"}
                ],
                "pros": ["Can bypass step therapy requirement", "Based on clinical grounds"],
                "cons": ["Requires clinical justification", "May take longer"],
                "success_probability": 0.60
            })

        elif classification.denial_type == "prior_auth_expired":
            # Option 1: Resubmit new PA
            options.append({
                "option_id": "RESUBMIT_NEW_PA",
                "name": "Submit New Prior Authorization",
                "description": "Submit a fresh PA request with updated clinical documentation",
                "score": 7.5,
                "actions": [
                    {"action": "update_clinical_documentation"},
                    {"action": "submit_new_pa", "priority": "urgent"}
                ],
                "pros": ["Clean start with current data", "Often faster than appeal"],
                "cons": ["Restarts the clock on approval timeline"],
                "success_probability": 0.80
            })

        else:
            # Catch-all for 'not_covered' and 'other' denial types
            options.append({
                "option_id": "WRITTEN_APPEAL_GENERAL",
                "name": "Written Appeal",
                "description": "Submit comprehensive written appeal with clinical evidence and coverage arguments",
                "score": 5.5,
                "actions": [
                    {"action": "generate_appeal_strategy"},
                    {"action": "draft_appeal_letter"},
                    {"action": "submit_appeal"}
                ],
                "pros": ["Applicable to any denial type", "Creates audit trail"],
                "cons": ["Lower success rate for coverage exclusions", "Longer timeline"],
                "success_probability": 0.45
            })

        # Option for pivoting (lower score generally)
        if len(case_state.get("payers", [])) > 1:
            options.append({
                "option_id": "PIVOT_TO_OTHER_PAYER",
                "name": f"Pivot Away from {payer_name}",
                "description": "Focus on other payer instead",
                "score": 4.0,
                "actions": [
                    {"action": "deprioritize_payer", "payer": payer_name},
                    {"action": "submit_to_other_payer"}
                ],
                "pros": ["May be faster if other payer approves"],
                "cons": ["Abandons potential approval", "May still need this payer"],
                "success_probability": 0.50
            })

        # Sort by score
        options.sort(key=lambda x: x["score"], reverse=True)

        # Mark top option as recommended
        if options:
            options[0]["is_recommended"] = True

        logger.info(
            "Recovery strategies generated",
            num_options=len(options),
            recommended=options[0]["option_id"] if options else None
        )

        return options

    def select_recovery_strategy(
        self,
        options: List[Dict[str, Any]],
        case_state: Dict[str, Any]
    ) -> RecoveryStrategy:
        """
        Select the best recovery strategy.

        Args:
            options: Available recovery options
            case_state: Current case state

        Returns:
            Selected RecoveryStrategy
        """
        if not options:
            raise ValueError("No recovery options available")

        selected = options[0]  # Highest scored

        # Determine if we should run parallel actions
        parallel = selected.get("option_id") == "PARALLEL_RECOVERY"

        return RecoveryStrategy(
            case_id=case_state.get("case_id", ""),
            payer_name=case_state.get("recovery_payer", "Unknown"),
            failure_type="denial",
            root_cause_analysis=case_state.get("recovery_reason", "Unknown denial"),
            linked_to_intake_gap=case_state.get("linked_intake_gap"),
            recovery_options=[{
                "id": opt["option_id"],
                "name": opt["name"],
                "score": opt["score"]
            } for opt in options],
            selected_option=selected["option_id"],
            selection_reasoning=f"Highest score ({selected['score']}) with {selected['success_probability']*100:.0f}% success probability",
            recovery_actions=selected.get("actions", []),
            deadline_tracking={},
            parallel_actions=parallel,
            escalation_trigger="Provider non-response after 48 hours"
        )

    async def generate_appeal_strategy(
        self,
        denial_response: Dict[str, Any],
        case_state: Dict[str, Any],
        payer_name: str
    ) -> AppealStrategy:
        """
        Generate clinical appeal strategy using Claude.

        CRITICAL: Uses Claude - no fallback.

        Args:
            denial_response: Payer denial details
            case_state: Current case state
            payer_name: Payer being appealed

        Returns:
            AppealStrategy with clinical arguments
        """
        logger.info("Generating appeal strategy", payer=payer_name)

        # Get policy text
        from backend.reasoning.policy_reasoner import get_policy_reasoner
        policy_reasoner = get_policy_reasoner()

        medication_name = case_state.get("medication_data", {}).get(
            "medication_request", {}
        ).get("medication_name", "unknown")

        try:
            policy_text = policy_reasoner.load_policy(payer_name, medication_name)
        except FileNotFoundError:
            policy_text = "Policy document not available"

        # Use Claude to generate appeal strategy
        result = await self.llm_gateway.generate_appeal_strategy(
            denial_context={
                "denial_reason_code": denial_response.get("denial_reason_code") or denial_response.get("denial_code", ""),
                "denial_reason": denial_response.get("denial_reason", ""),
                "original_request": case_state.get("medication_data", {}),
                "available_documentation": case_state.get("available_documents", [])
            },
            patient_info=case_state.get("patient_data", {}),
            policy_text=policy_text
        )

        # Parse into AppealStrategy
        return AppealStrategy(
            case_id=case_state.get("case_id", ""),
            payer_name=payer_name,
            denial_reason_code=denial_response.get("denial_reason_code") or denial_response.get("denial_code", ""),
            denial_reason_text=denial_response.get("denial_reason", ""),
            denial_classification=result.get("denial_classification", "other"),
            primary_clinical_argument=result.get("primary_argument", ""),
            supporting_arguments=result.get("supporting_arguments", []),
            evidence_to_cite=result.get("evidence_to_cite", []),
            policy_sections_to_reference=result.get("policy_sections", []),
            medical_literature_citations=result.get("citations", []),
            recommended_appeal_type=result.get("appeal_type", "standard"),
            urgency_justification=result.get("urgency_justification"),
            peer_to_peer_talking_points=result.get("p2p_points"),
            success_probability=(
                result.get("success_probability", {}).get("estimated_success_rate", 0.5)
                if isinstance(result.get("success_probability"), dict)
                else result.get("success_probability", 0.5)
            ),
            success_probability_reasoning=result.get("success_reasoning", ""),
            key_risks=result.get("risks", []),
            fallback_strategies=result.get("fallbacks", [])
        )


# Global instance
_recovery_agent: Optional[RecoveryAgent] = None


def get_recovery_agent() -> RecoveryAgent:
    """Get or create the global recovery agent."""
    global _recovery_agent
    if _recovery_agent is None:
        _recovery_agent = RecoveryAgent()
    return _recovery_agent
