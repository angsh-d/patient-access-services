"""LangGraph state definitions for the case orchestrator."""
from typing import TypedDict, Dict, List, Optional, Any, Annotated
from operator import add

from backend.models.enums import CaseStage


class OrchestratorState(TypedDict, total=False):
    """
    State for the LangGraph case orchestrator.
    This state flows through all nodes in the graph.
    """
    # Case identification
    case_id: str
    patient_id: str

    # Current stage
    stage: CaseStage
    previous_stage: Optional[CaseStage]

    # Patient and medication data
    patient_data: Dict[str, Any]
    medication_data: Dict[str, Any]

    # Payer information
    payers: List[str]
    payer_states: Dict[str, Dict[str, Any]]

    # Policy analysis results
    coverage_assessments: Dict[str, Dict[str, Any]]
    documentation_gaps: List[Dict[str, Any]]

    # Digitized policy data (from policy_digitalization module)
    digitized_policies: Dict[str, Dict[str, Any]]  # payer -> DigitizedPolicy dict
    policy_evaluation_results: Dict[str, Dict[str, Any]]  # payer -> PolicyEvaluationResult dict

    # Strategy
    available_strategies: List[Dict[str, Any]]
    strategy_scores: List[Dict[str, Any]]
    selected_strategy: Optional[Dict[str, Any]]
    strategy_rationale: Optional[str]

    # Action tracking
    current_action: Optional[Dict[str, Any]]
    pending_actions: List[Dict[str, Any]]
    completed_actions: Annotated[List[Dict[str, Any]], add]  # Accumulates across nodes

    # Payer responses
    payer_responses: Dict[str, Dict[str, Any]]

    # Recovery
    recovery_needed: bool
    recovery_reason: Optional[str]
    recovery_strategy: Optional[Dict[str, Any]]

    # Errors and messages
    error: Optional[str]
    messages: Annotated[List[str], add]  # Accumulates messages

    # Human decision gate (Anthropic skill pattern)
    requires_human_decision: bool
    human_decision_reason: Optional[str]
    human_decision: Optional[Dict[str, Any]]
    human_decisions: List[Dict[str, Any]]

    # Monitoring loop guard
    monitoring_iterations: int

    # Completion
    is_complete: bool
    final_outcome: Optional[str]

    # Metadata
    metadata: Dict[str, Any]


def create_initial_state(
    case_id: str,
    patient_id: str,
    patient_data: Dict[str, Any],
    medication_data: Dict[str, Any],
    payers: Optional[List[str]] = None
) -> OrchestratorState:
    """
    Create initial state for the orchestrator.

    Args:
        case_id: Unique case identifier
        patient_id: Patient identifier
        patient_data: Patient information
        medication_data: Medication request details
        payers: List of payers (defaults to primary/secondary from patient data)

    Returns:
        Initial orchestrator state
    """
    # Extract payers from patient data if not provided
    if payers is None:
        payers = []
        if patient_data.get("insurance", {}).get("primary"):
            payers.append(patient_data["insurance"]["primary"].get("payer_name", "Unknown"))
        if patient_data.get("insurance", {}).get("secondary"):
            payers.append(patient_data["insurance"]["secondary"].get("payer_name", "Unknown"))

    return OrchestratorState(
        case_id=case_id,
        patient_id=patient_id,
        stage=CaseStage.INTAKE,
        previous_stage=None,
        patient_data=patient_data,
        medication_data=medication_data,
        payers=payers,
        payer_states={payer: {"payer_name": payer, "status": "not_submitted", "required_documents": []} for payer in payers},
        coverage_assessments={},
        documentation_gaps=[],
        digitized_policies={},
        policy_evaluation_results={},
        available_strategies=[],
        strategy_scores=[],
        selected_strategy=None,
        strategy_rationale=None,
        current_action=None,
        pending_actions=[],
        completed_actions=[],
        payer_responses={},
        recovery_needed=False,
        recovery_reason=None,
        recovery_strategy=None,
        error=None,
        messages=[f"Case {case_id} initialized"],
        requires_human_decision=False,
        human_decision_reason=None,
        human_decision=None,
        human_decisions=[],
        monitoring_iterations=0,
        is_complete=False,
        final_outcome=None,
        metadata={}
    )


def transition_stage(state: OrchestratorState, new_stage: CaseStage) -> OrchestratorState:
    """
    Create a state update for stage transition.

    Args:
        state: Current state
        new_stage: Stage to transition to

    Returns:
        State updates dictionary
    """
    return {
        "previous_stage": state.get("stage"),
        "stage": new_stage,
        "messages": [f"Transitioned from {state.get('stage', 'unknown').value} to {new_stage.value}"]
    }
