"""State transition functions for the LangGraph orchestrator."""
from typing import Dict, Any, Literal

from backend.orchestrator.state import OrchestratorState, transition_stage
from backend.models.enums import CaseStage
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


def should_continue_processing(state: OrchestratorState) -> Literal["continue", "complete", "failed", "recovery"]:
    """
    Determine the next routing decision based on current state.

    Args:
        state: Current orchestrator state

    Returns:
        Routing decision
    """
    if state.get("error"):
        logger.warning("Error detected", error=state["error"])
        return "failed"

    if state.get("is_complete"):
        return "complete"

    if state.get("recovery_needed"):
        return "recovery"

    return "continue"


def should_proceed_to_strategy(state: OrchestratorState) -> Literal["strategy", "wait_analysis"]:
    """
    Check if we have enough analysis to proceed to strategy generation.

    Args:
        state: Current orchestrator state

    Returns:
        Routing decision
    """
    assessments = state.get("coverage_assessments", {})
    payers = state.get("payers", [])

    # Need assessment for at least primary payer
    if payers and payers[0] in assessments:
        return "strategy"

    return "wait_analysis"


def should_proceed_to_action(state: OrchestratorState) -> Literal["action", "wait_selection"]:
    """
    Check if strategy is selected and ready for action.

    Args:
        state: Current orchestrator state

    Returns:
        Routing decision
    """
    if state.get("selected_strategy"):
        return "action"
    return "wait_selection"


def check_payer_responses(state: OrchestratorState) -> Literal["approved", "denied", "pending", "partial"]:
    """
    Analyze payer responses to determine next steps.

    Args:
        state: Current orchestrator state

    Returns:
        Response status
    """
    payer_states = state.get("payer_states", {})
    responses = state.get("payer_responses", {})

    approvals = 0
    denials = 0
    pending = 0

    for payer, payer_state in payer_states.items():
        status = payer_state.get("status", "not_submitted")

        if status in ["approved", "appeal_approved"]:
            approvals += 1
        elif status in ["denied", "appeal_denied"]:
            denials += 1
        elif status in ["submitted", "pending", "pending_info", "under_review", "appeal_pending"]:
            pending += 1

    total = len(payer_states)

    if approvals == total and total > 0:
        return "approved"
    elif denials > 0 and pending == 0:
        return "denied"
    elif approvals > 0 and (denials > 0 or pending > 0):
        return "partial"
    else:
        return "pending"


def needs_recovery(state: OrchestratorState) -> bool:
    """
    Determine if recovery workflow is needed.

    Args:
        state: Current orchestrator state

    Returns:
        True if recovery is needed
    """
    payer_states = state.get("payer_states", {})

    for payer, payer_state in payer_states.items():
        status = payer_state.get("status", "")
        if status == "denied":
            # Check if appeal is possible
            response = state.get("payer_responses", {}).get(payer, {})
            if response.get("appeal_deadline"):
                return True

    return False


def get_next_stage(state: OrchestratorState) -> CaseStage:
    """
    Determine the next stage based on current state.

    Args:
        state: Current orchestrator state

    Returns:
        Next stage
    """
    current_stage = state.get("stage", CaseStage.INTAKE)

    stage_flow = {
        CaseStage.INTAKE: CaseStage.POLICY_ANALYSIS,
        CaseStage.POLICY_ANALYSIS: CaseStage.STRATEGY_GENERATION,
        CaseStage.STRATEGY_GENERATION: CaseStage.STRATEGY_SELECTION,
        CaseStage.STRATEGY_SELECTION: CaseStage.ACTION_COORDINATION,
        CaseStage.ACTION_COORDINATION: CaseStage.MONITORING,
        CaseStage.MONITORING: CaseStage.COMPLETED,
        CaseStage.RECOVERY: CaseStage.MONITORING,
    }

    return stage_flow.get(current_stage, CaseStage.COMPLETED)


def apply_stage_transition(state: OrchestratorState, new_stage: CaseStage) -> Dict[str, Any]:
    """
    Apply a stage transition to the state.

    Args:
        state: Current state
        new_stage: New stage

    Returns:
        State updates
    """
    logger.info(
        "Stage transition",
        case_id=state.get("case_id"),
        from_stage=state.get("stage", CaseStage.INTAKE).value,
        to_stage=new_stage.value
    )

    return transition_stage(state, new_stage)


def mark_complete(state: OrchestratorState, outcome: str) -> Dict[str, Any]:
    """
    Mark the case as complete.

    Args:
        state: Current state
        outcome: Final outcome description

    Returns:
        State updates
    """
    logger.info(
        "Case completed",
        case_id=state.get("case_id"),
        outcome=outcome
    )

    return {
        "stage": CaseStage.COMPLETED,
        "is_complete": True,
        "final_outcome": outcome,
        "messages": [f"Case completed: {outcome}"]
    }


def mark_failed(state: OrchestratorState, error: str) -> Dict[str, Any]:
    """
    Mark the case as failed.

    Args:
        state: Current state
        error: Error description

    Returns:
        State updates
    """
    logger.error(
        "Case failed",
        case_id=state.get("case_id"),
        error=error
    )

    return {
        "stage": CaseStage.FAILED,
        "is_complete": True,
        "error": error,
        "final_outcome": f"Failed: {error}",
        "messages": [f"Case failed: {error}"]
    }


def initiate_recovery(state: OrchestratorState, reason: str) -> Dict[str, Any]:
    """
    Initiate recovery workflow.

    Args:
        state: Current state
        reason: Reason for recovery

    Returns:
        State updates
    """
    logger.info(
        "Recovery initiated",
        case_id=state.get("case_id"),
        reason=reason
    )

    return {
        "stage": CaseStage.RECOVERY,
        "recovery_needed": True,
        "recovery_reason": reason,
        "messages": [f"Recovery initiated: {reason}"]
    }
