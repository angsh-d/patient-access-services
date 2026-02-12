"""Recovery agent for handling denials and setbacks — LLM-powered."""
import json
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

    All classification, strategy generation, and selection are LLM-powered
    via task-routed prompts through the LLM gateway.
    """

    def __init__(self):
        """Initialize the recovery agent."""
        self.llm_gateway = get_llm_gateway()
        self.prompt_loader = get_prompt_loader()
        logger.info("Recovery agent initialized")

    async def classify_denial(
        self,
        denial_response: Dict[str, Any],
        case_state: Dict[str, Any]
    ) -> DenialClassification:
        """
        Classify a denial using LLM reasoning.

        Args:
            denial_response: Payer denial response
            case_state: Current case state (to find linked gaps)

        Returns:
            DenialClassification with recovery guidance
        """
        prompt = self.prompt_loader.load(
            "recovery/denial_classification.txt",
            {
                "denial_response": json.dumps(denial_response, indent=2, default=str),
                "case_context": json.dumps({
                    "case_id": case_state.get("case_id", ""),
                    "stage": case_state.get("stage", ""),
                    "patient_data": case_state.get("patient_data", {}),
                    "medication_data": case_state.get("medication_data", {}),
                    "coverage_assessments": case_state.get("coverage_assessments", {}),
                }, indent=2, default=str),
                "documentation_gaps": json.dumps(
                    case_state.get("documentation_gaps", []), indent=2, default=str
                ),
            },
        )

        result = await self.llm_gateway.generate(
            task_category=TaskCategory.DENIAL_CLASSIFICATION,
            prompt=prompt,
            temperature=0.0,
            response_format="json",
        )

        # Parse LLM response
        denial_type = result.get("denial_type", "other")
        valid_types = {
            "medical_necessity", "documentation_incomplete",
            "step_therapy", "prior_auth_expired", "not_covered", "other",
        }
        if denial_type not in valid_types:
            denial_type = "other"

        is_recoverable = result.get("is_recoverable", True)
        root_cause = result.get("root_cause", denial_response.get("denial_reason", "Unknown"))

        linked_gaps = result.get("linked_intake_gaps", [])
        linked_gap = linked_gaps[0] if linked_gaps else None

        urgency = result.get("urgency", "standard")
        if urgency not in ("standard", "urgent", "emergent"):
            urgency = "standard"

        classification = DenialClassification(
            denial_type=denial_type,
            is_recoverable=is_recoverable,
            root_cause=root_cause,
            linked_intake_gap=linked_gap,
            urgency=urgency,
        )

        logger.info(
            "Denial classified (LLM)",
            denial_type=denial_type,
            is_recoverable=is_recoverable,
            root_cause=root_cause,
            linked_gap=linked_gap,
        )

        return classification

    async def generate_recovery_strategies(
        self,
        classification: DenialClassification,
        case_state: Dict[str, Any],
        payer_name: str
    ) -> List[Dict[str, Any]]:
        """
        Generate recovery strategies using LLM reasoning.

        Args:
            classification: LLM-generated denial classification
            case_state: Current case state
            payer_name: Payer that denied

        Returns:
            List of recovery options ranked by success probability
        """
        # Build policy context
        policy_context = ""
        try:
            from backend.reasoning.policy_reasoner import get_policy_reasoner
            med_name = case_state.get("medication_data", {}).get(
                "medication_request", case_state.get("medication_data", {})
            ).get("medication_name", "unknown")
            policy_context = get_policy_reasoner().load_policy(payer_name, med_name)
        except (FileNotFoundError, Exception) as e:
            logger.debug("Policy text unavailable for recovery strategy", error=str(e))
            policy_context = "Policy document not available"

        available_payers = list(case_state.get("payer_states", {}).keys())

        prompt = self.prompt_loader.load(
            "recovery/recovery_strategy.txt",
            {
                "denial_classification": json.dumps({
                    "denial_type": classification.denial_type,
                    "root_cause": classification.root_cause,
                    "is_recoverable": classification.is_recoverable,
                    "urgency": classification.urgency,
                    "linked_intake_gap": classification.linked_intake_gap,
                }, indent=2),
                "patient_profile": json.dumps(
                    case_state.get("patient_data", {}), indent=2, default=str
                ),
                "policy_context": policy_context[:3000],
                "available_payers": json.dumps(available_payers),
            },
        )

        result = await self.llm_gateway.generate(
            task_category=TaskCategory.RECOVERY_STRATEGY,
            prompt=prompt,
            temperature=0.2,
            response_format="json",
        )

        # Parse: result may be a list directly or wrapped in {"response": ...}
        options = result if isinstance(result, list) else result.get("response", result)
        if isinstance(options, str):
            try:
                options = json.loads(options)
            except json.JSONDecodeError as e:
                logger.error(
                    "Failed to parse recovery strategy LLM response as JSON",
                    error=str(e),
                    raw_response=options[:500],
                )
                raise ValueError(f"LLM returned invalid JSON for recovery strategies: {e}") from e
        if isinstance(options, dict):
            # Unwrap common wrapper keys
            for key in ("strategies", "recovery_strategies", "options"):
                if key in options and isinstance(options[key], list):
                    options = options[key]
                    break
            else:
                options = [options]

        # Ensure each option has required fields
        for opt in options:
            opt.setdefault("option_id", str(uuid4())[:8].upper())
            opt.setdefault("score", opt.get("success_probability", 0.5) * 10)
            opt.setdefault("success_probability", opt.get("score", 5.0) / 10)

        # Sort by success_probability descending
        options.sort(key=lambda x: x.get("success_probability", 0), reverse=True)

        # Mark recommended
        recommended_count = sum(1 for o in options if o.get("is_recommended"))
        if recommended_count == 0 and options:
            options[0]["is_recommended"] = True

        logger.info(
            "Recovery strategies generated (LLM)",
            num_options=len(options),
            recommended=next((o["option_id"] for o in options if o.get("is_recommended")), None),
        )

        return options

    async def select_recovery_strategy(
        self,
        options: List[Dict[str, Any]],
        case_state: Dict[str, Any]
    ) -> RecoveryStrategy:
        """
        Select the best recovery strategy (LLM-recommended option).

        Args:
            options: Available recovery options (already ranked by LLM)
            case_state: Current case state

        Returns:
            Selected RecoveryStrategy
        """
        if not options:
            raise ValueError("No recovery options available")

        # Use the LLM-recommended option, or fall back to highest-ranked
        selected = next(
            (o for o in options if o.get("is_recommended")),
            options[0],
        )

        parallel = "parallel" in selected.get("name", "").lower() or any(
            a.get("parallel") for a in selected.get("actions", [])
        )

        return RecoveryStrategy(
            case_id=case_state.get("case_id", ""),
            payer_name=case_state.get("recovery_payer", "Unknown"),
            failure_type="denial",
            root_cause_analysis=case_state.get("recovery_reason", "Unknown denial"),
            linked_to_intake_gap=case_state.get("linked_intake_gap"),
            recovery_options=[{
                "id": opt.get("option_id", ""),
                "name": opt.get("name", ""),
                "score": opt.get("score", 0),
                "success_probability": opt.get("success_probability", 0),
            } for opt in options],
            selected_option=selected.get("option_id", ""),
            selection_reasoning=selected.get(
                "success_reasoning",
                f"LLM-recommended with {selected.get('success_probability', 0)*100:.0f}% estimated success",
            ),
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

        # Parse nested LLM response into AppealStrategy
        # LLM returns: {denial_analysis, appeal_strategy, documentation_needed,
        #               timeline_considerations, success_probability, alternative_pathways}
        denial_analysis = result.get("denial_analysis", {})
        strategy = result.get("appeal_strategy", {})
        success_prob = result.get("success_probability", {})
        key_arguments = strategy.get("key_arguments", [])
        timeline = result.get("timeline_considerations", {})

        # Extract primary argument from first key_argument, rest are supporting
        primary_argument = key_arguments[0].get("argument", "") if key_arguments else ""
        supporting_args = [a.get("argument", "") for a in key_arguments[1:]] if len(key_arguments) > 1 else []

        # Collect all evidence and policy references across arguments
        evidence = []
        policy_refs = []
        for arg in key_arguments:
            for ev in arg.get("supporting_evidence", []):
                if isinstance(ev, str):
                    evidence.append({"description": ev})
                elif isinstance(ev, dict):
                    evidence.append(ev)
            ref = arg.get("policy_reference", "")
            if ref:
                policy_refs.append(ref)

        # Map primary_approach to appeal type
        approach_map = {
            "peer_to_peer": "peer_to_peer",
            "clinical_rationale": "standard",
            "medical_necessity": "standard",
            "policy_interpretation": "standard",
            "formulary_exception": "standard",
        }
        approach = strategy.get("primary_approach", "standard")
        appeal_type = approach_map.get(approach, "standard")

        # Map denial analysis to classification
        issues = denial_analysis.get("underlying_issues", [])
        addressable = denial_analysis.get("addressable_gaps", [])
        classification = "other"
        stated = denial_analysis.get("stated_reason", "").lower()
        if "step therapy" in stated or "step therapy" in " ".join(issues).lower():
            classification = "step_therapy"
        elif "documentation" in stated or "documentation" in " ".join(issues).lower():
            classification = "documentation_incomplete"
        elif "medical necessity" in stated:
            classification = "medical_necessity"
        elif "formulary" in stated or "not covered" in stated:
            classification = "not_covered"

        # Build P2P talking points if P2P recommended
        p2p_points = None
        if strategy.get("peer_to_peer_recommended"):
            p2p_points = [a.get("argument", "") for a in key_arguments if a.get("argument")]

        # Alternative pathways as fallback strategies
        alt_pathways = result.get("alternative_pathways", [])
        fallbacks = [p.get("pathway", "") for p in alt_pathways if isinstance(p, dict)]

        return AppealStrategy(
            case_id=case_state.get("case_id", ""),
            payer_name=payer_name,
            denial_reason_code=denial_response.get("denial_reason_code") or denial_response.get("denial_code", ""),
            denial_reason_text=denial_response.get("denial_reason", ""),
            denial_classification=classification,
            primary_clinical_argument=primary_argument,
            supporting_arguments=supporting_args,
            evidence_to_cite=evidence,
            policy_sections_to_reference=policy_refs,
            medical_literature_citations=[],
            recommended_appeal_type=appeal_type,
            urgency_justification=timeline.get("urgency_level"),
            peer_to_peer_talking_points=p2p_points,
            success_probability=(
                success_prob.get("estimated_success_rate", 0.5)
                if isinstance(success_prob, dict)
                else success_prob if isinstance(success_prob, (int, float)) else 0.5
            ),
            success_probability_reasoning=" ".join(
                success_prob.get("factors_favoring_success", [])
            ) if isinstance(success_prob, dict) else "",
            key_risks=(
                success_prob.get("factors_against_success", [])
                if isinstance(success_prob, dict) else []
            ),
            fallback_strategies=fallbacks,
        )


# Global instance
_recovery_agent: Optional[RecoveryAgent] = None


def get_recovery_agent() -> RecoveryAgent:
    """Get or create the global recovery agent."""
    global _recovery_agent
    if _recovery_agent is None:
        _recovery_agent = RecoveryAgent()
    return _recovery_agent
