"""LangGraph case orchestrator for managing PA workflow."""
from typing import Dict, Any, Optional, Callable, AsyncIterator
import json
from pathlib import Path

from langgraph.graph import StateGraph, END

from backend.orchestrator.state import OrchestratorState, create_initial_state
from backend.orchestrator.transitions import (
    should_continue_processing,
    should_proceed_to_strategy,
    check_payer_responses,
    needs_recovery,
    apply_stage_transition,
    mark_complete,
    mark_failed,
    initiate_recovery
)
from backend.models.enums import CaseStage
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class CaseOrchestrator:
    """
    LangGraph-based orchestrator for PA case processing.
    Manages the state machine flow from intake to completion.
    """

    def __init__(self):
        """Initialize the orchestrator with the workflow graph."""
        self._graph = self._build_graph()
        self._compiled = self._graph.compile()
        self._event_handlers: Dict[str, list] = {}
        logger.info("Case orchestrator initialized")

    def _build_graph(self) -> StateGraph:
        """Build the LangGraph workflow."""
        graph = StateGraph(OrchestratorState)

        # Add nodes
        graph.add_node("intake", self._intake_node)
        graph.add_node("policy_analysis", self._policy_analysis_node)
        graph.add_node("human_decision_gate", self._human_decision_gate_node)  # Human gate
        graph.add_node("strategy_generation", self._strategy_generation_node)
        graph.add_node("strategy_selection", self._strategy_selection_node)
        graph.add_node("action_coordination", self._action_coordination_node)
        graph.add_node("monitoring", self._monitoring_node)
        graph.add_node("recovery", self._recovery_node)
        graph.add_node("completion", self._completion_node)
        graph.add_node("failure", self._failure_node)

        # Set entry point
        graph.set_entry_point("intake")

        # Add edges
        graph.add_edge("intake", "policy_analysis")

        # Policy analysis routes to human decision gate
        graph.add_conditional_edges(
            "policy_analysis",
            self._route_after_policy_analysis,
            {
                "human_gate": "human_decision_gate",
                "continue": "strategy_generation"
            }
        )

        # Human decision gate routes based on decision
        # "waiting" goes to END to pause execution - resumed via resume_after_human_decision()
        graph.add_conditional_edges(
            "human_decision_gate",
            self._route_after_human_decision,
            {
                "approved": "strategy_generation",
                "waiting": END,  # Pause execution - await external human decision
                "failed": "failure"
            }
        )

        graph.add_edge("strategy_generation", "strategy_selection")
        graph.add_edge("strategy_selection", "action_coordination")

        # Add shared edges from strategy_generation onwards
        self._add_post_strategy_edges(graph)

        return graph

    def _add_post_strategy_edges(self, graph: StateGraph) -> None:
        """
        Add edges from action_coordination onwards.
        Shared between main graph and continuation graph to avoid duplication.
        """
        graph.add_conditional_edges(
            "action_coordination",
            self._route_after_action,
            {
                "monitoring": "monitoring",
                "recovery": "recovery",
                "failed": "failure"
            }
        )

        graph.add_conditional_edges(
            "monitoring",
            self._route_after_monitoring,
            {
                "complete": "completion",
                "recovery": "recovery",
                "continue": "action_coordination"
            }
        )

        graph.add_conditional_edges(
            "recovery",
            self._route_after_recovery,
            {
                "monitoring": "monitoring",
                "complete": "completion",
                "failed": "failure"
            }
        )

        graph.add_edge("completion", END)
        graph.add_edge("failure", END)

    async def _intake_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Process intake stage."""
        logger.info("Processing intake", case_id=state.get("case_id"))

        # Validate patient and medication data
        patient_data = state.get("patient_data", {})
        medication_data = state.get("medication_data", {})

        if not patient_data:
            return {"error": "Missing patient data", "messages": ["Intake failed: No patient data"]}

        if not medication_data:
            return {"error": "Missing medication data", "messages": ["Intake failed: No medication data"]}

        return apply_stage_transition(state, CaseStage.POLICY_ANALYSIS)

    async def _policy_analysis_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Analyze payer policies."""
        logger.info("Analyzing policies", case_id=state.get("case_id"))

        # Import here to avoid circular dependency
        from backend.reasoning.policy_reasoner import get_policy_reasoner

        reasoner = get_policy_reasoner()
        payers = state.get("payers", [])
        patient_data = state.get("patient_data", {})
        medication_data = state.get("medication_data", {})

        assessments = {}
        all_gaps = []

        # Determine primary payer (first in list by convention)
        primary_payer = payers[0] if payers else None

        for payer in payers:
            try:
                # Build patient info for assessment
                patient_info = {
                    "patient_id": patient_data.get("patient_id"),
                    "demographics": patient_data.get("demographics", {}),
                    "clinical_profile": patient_data.get("clinical_profile", {}),
                    "insurance": patient_data.get("insurance", {})
                }

                medication_info = medication_data.get("medication_request", medication_data)

                assessment = await reasoner.assess_coverage(
                    patient_info=patient_info,
                    medication_info=medication_info,
                    payer_name=payer
                )

                assessments[payer] = assessment.model_dump()
                all_gaps.extend([g.model_dump() for g in assessment.documentation_gaps])

            except Exception as e:
                logger.error("Policy analysis failed", payer=payer, error=str(e))
                # Primary payer failure is critical — cannot proceed without it
                if payer == primary_payer:
                    return {
                        "error": f"Primary payer ({payer}) policy analysis failed: {e}",
                        "messages": [f"CRITICAL: Primary payer {payer} analysis failed — cannot proceed"]
                    }
                # Secondary payer failures are non-critical — continue

        # Check if human decision is required based on coverage results
        requires_human = self._check_requires_human_decision(assessments)

        if requires_human:
            return {
                **apply_stage_transition(state, CaseStage.AWAITING_HUMAN_DECISION),
                "coverage_assessments": assessments,
                "documentation_gaps": all_gaps,
                "requires_human_decision": True,
                "human_decision_reason": "Coverage assessment requires human review before proceeding",
                "messages": [f"Analyzed {len(assessments)} payer policies - awaiting human decision"]
            }

        return {
            **apply_stage_transition(state, CaseStage.STRATEGY_GENERATION),
            "coverage_assessments": assessments,
            "documentation_gaps": all_gaps,
            "requires_human_decision": False,
            "messages": [f"Analyzed {len(assessments)} payer policies"]
        }

    def _check_requires_human_decision(self, assessments: Dict[str, Any]) -> bool:
        """
        Check if human decision is required based on coverage assessments.

        Human decision is required when:
        - Any payer has NOT_COVERED or REQUIRES_HUMAN_REVIEW status
        - Approval likelihood is below threshold
        - Conservative mode is enabled (default)
        """
        for payer, assessment in assessments.items():
            status = assessment.get("coverage_status", "unknown")
            likelihood = assessment.get("approval_likelihood", 0.5)

            # Require human decision for problematic statuses
            if status in ["not_covered", "requires_human_review", "unknown"]:
                return True

            # Require human decision for low confidence
            if likelihood < 0.5:
                return True

        return False

    async def _human_decision_gate_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """
        Human decision gate - case pauses here until human confirms.

        This node implements the Anthropic skill pattern of mandatory
        human checkpoints. The case will not progress until a human
        explicitly approves, rejects, or overrides the AI recommendation.
        """
        logger.info("At human decision gate", case_id=state.get("case_id"))

        # Check if human has made a decision
        human_decision = state.get("human_decision")

        if human_decision:
            action = human_decision.get("action", "")

            if action == "approve":
                logger.info(
                    "Human approved",
                    case_id=state.get("case_id"),
                    reviewer=human_decision.get("reviewer_id")
                )
                return {
                    **apply_stage_transition(state, CaseStage.STRATEGY_GENERATION),
                    "requires_human_decision": False,
                    "human_decision_confirmed": True,
                    "messages": ["Human decision: Approved - proceeding to strategy generation"]
                }

            elif action == "reject":
                logger.info(
                    "Human rejected",
                    case_id=state.get("case_id"),
                    reviewer=human_decision.get("reviewer_id"),
                    reason=human_decision.get("reason")
                )
                return {
                    "requires_human_decision": False,
                    "human_decision_confirmed": True,
                    "error": f"Case rejected by human reviewer: {human_decision.get('reason', 'No reason provided')}",
                    "messages": ["Human decision: Rejected"]
                }

            elif action == "override":
                logger.info(
                    "Human override",
                    case_id=state.get("case_id"),
                    reviewer=human_decision.get("reviewer_id"),
                    override_to=human_decision.get("override_status")
                )
                return {
                    **apply_stage_transition(state, CaseStage.STRATEGY_GENERATION),
                    "requires_human_decision": False,
                    "human_decision_confirmed": True,
                    "human_override_applied": True,
                    "messages": [f"Human decision: Override to {human_decision.get('override_status')}"]
                }

        # No decision yet - stay at gate
        return {
            "requires_human_decision": True,
            "human_decision_confirmed": False,
            "stage": CaseStage.AWAITING_HUMAN_DECISION,
            "messages": ["Awaiting human decision - case paused at decision gate"]
        }

    def _route_after_policy_analysis(self, state: OrchestratorState) -> str:
        """Route after policy analysis - check if human gate needed."""
        if state.get("requires_human_decision"):
            return "human_gate"
        return "continue"

    def _route_after_human_decision(self, state: OrchestratorState) -> str:
        """Route after human decision gate."""
        if state.get("error"):
            return "failed"
        if state.get("human_decision_confirmed"):
            return "approved"
        return "waiting"

    async def _strategy_generation_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Generate access strategies."""
        logger.info("Generating strategies", case_id=state.get("case_id"))

        from backend.reasoning.strategy_scorer import get_strategy_scorer
        from backend.models.coverage import CoverageAssessment

        scorer = get_strategy_scorer()

        # Convert assessments back to CoverageAssessment objects
        assessments = {}
        for payer, data in state.get("coverage_assessments", {}).items():
            assessments[payer] = CoverageAssessment(**data)

        # Generate strategies
        strategies = scorer.generate_strategies(assessments)
        strategy_dicts = [s.model_dump() for s in strategies]

        return {
            **apply_stage_transition(state, CaseStage.STRATEGY_SELECTION),
            "available_strategies": strategy_dicts,
            "messages": [f"Generated {len(strategies)} strategies"]
        }

    async def _strategy_selection_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Score and select optimal strategy."""
        logger.info("Selecting strategy", case_id=state.get("case_id"))

        from backend.reasoning.strategy_scorer import get_strategy_scorer
        from backend.models.strategy import Strategy
        from backend.models.coverage import CoverageAssessment

        scorer = get_strategy_scorer()

        # Reconstruct objects
        strategies = [Strategy(**s) for s in state.get("available_strategies", [])]
        assessments = {}
        for payer, data in state.get("coverage_assessments", {}).items():
            assessments[payer] = CoverageAssessment(**data)

        # Score all strategies
        best_strategy, all_scores = scorer.select_best_strategy(
            strategies=strategies,
            case_id=state.get("case_id", ""),
            coverage_assessments=assessments
        )

        if not best_strategy:
            return {"error": "No strategy could be selected", "messages": ["Strategy selection failed"]}

        score_dicts = [s.model_dump() for s in all_scores]
        rationale = all_scores[0].recommendation_reasoning if all_scores else "Selected highest scoring strategy"

        return {
            **apply_stage_transition(state, CaseStage.ACTION_COORDINATION),
            "selected_strategy": best_strategy.model_dump(),
            "strategy_scores": score_dicts,
            "strategy_rationale": rationale,
            "messages": [f"Selected strategy: {best_strategy.name} (score: {all_scores[0].total_score:.2f})"]
        }

    async def _action_coordination_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Coordinate actions based on selected strategy."""
        logger.info("Coordinating actions", case_id=state.get("case_id"))

        from backend.agents.action_coordinator import get_action_coordinator

        coordinator = get_action_coordinator()
        selected_strategy = state.get("selected_strategy")

        if not selected_strategy:
            return {"error": "No strategy selected", "messages": ["Action coordination failed"]}

        # Execute next action in strategy
        result = await coordinator.execute_next_action(state)

        return {
            **apply_stage_transition(state, CaseStage.MONITORING),
            **result,
            "messages": [f"Action executed: {result.get('action_type', 'unknown')}"]
        }

    async def _monitoring_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Monitor payer responses and case status."""
        iterations = state.get("monitoring_iterations", 0) + 1
        logger.info("Monitoring case", case_id=state.get("case_id"), iteration=iterations)

        # First, check status with payers that have submissions pending
        from backend.agents.action_coordinator import get_action_coordinator
        coordinator = get_action_coordinator()

        payer_states = state.get("payer_states", {})
        # Capture statuses before polling to detect progress
        previous_statuses = {p: s.get("status") for p, s in payer_states.items()}
        updated_payer_states = dict(payer_states)
        state_updates = {}

        for payer_name, payer_state in payer_states.items():
            status = payer_state.get("status", "not_submitted")
            # Check status for submitted/pending payers
            if status in ["submitted", "pending", "under_review", "appeal_pending"]:
                try:
                    status_result = await coordinator.check_payer_status(state, payer_name)
                    if "payer_states" in status_result:
                        updated_payer_states.update(status_result["payer_states"])
                    if status_result.get("recovery_needed"):
                        state_updates["recovery_needed"] = True
                        state_updates["recovery_reason"] = status_result.get("recovery_reason")
                except Exception as e:
                    logger.error("Failed to check payer status", payer=payer_name, error=str(e))

        # Update state with new payer states and iteration counter
        state_updates["payer_states"] = updated_payer_states
        state_updates["monitoring_iterations"] = iterations

        # Detect stale progress — if no payer status changed, track consecutive stalls
        current_statuses = {p: s.get("status") for p, s in updated_payer_states.items()}
        stale_iterations = state.get("stale_iterations", 0)
        if current_statuses == previous_statuses:
            stale_iterations += 1
        else:
            stale_iterations = 0
        state_updates["stale_iterations"] = stale_iterations

        if stale_iterations >= 2:
            logger.warning("No progress after 2 consecutive monitoring iterations, completing",
                           case_id=state.get("case_id"))
            return {
                **state_updates,
                "messages": ["Monitoring: no progress detected, completing case"],
                "is_complete": True,
                "final_outcome": "Case processed - no further payer status changes detected"
            }

        # Now check the updated response status
        updated_state = {**state, **state_updates}
        response_status = check_payer_responses(updated_state)

        if response_status == "approved":
            return {
                **state_updates,
                "messages": ["All payers approved"],
                "is_complete": True,
                "final_outcome": "All authorizations approved"
            }
        elif response_status == "denied":
            if needs_recovery(updated_state):
                return {**state_updates, **initiate_recovery(updated_state, "Payer denial - appeal available")}
            else:
                return {
                    **state_updates,
                    "messages": ["Authorization denied, no recovery path"],
                    "is_complete": True,
                    "final_outcome": "Authorization denied"
                }
        elif response_status == "partial":
            return {**state_updates, "messages": ["Partial approval, continuing workflow"]}
        else:
            # Pending - but we've checked status, so this shouldn't loop forever
            # Mark as complete if we've done all we can
            return {
                **state_updates,
                "messages": ["Monitoring complete - awaiting final responses"],
                "is_complete": True,
                "final_outcome": "Case processed - awaiting payer determinations"
            }

    async def _recovery_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Handle recovery from denials or issues."""
        logger.info("Processing recovery", case_id=state.get("case_id"))

        from backend.agents.action_coordinator import get_action_coordinator

        coordinator = get_action_coordinator()

        # Determine recovery action (appeal, P2P, etc.)
        recovery_result = await coordinator.execute_recovery_action(state)

        return {
            **recovery_result,
            "recovery_needed": False,  # Reset after handling
            "messages": [f"Recovery action: {recovery_result.get('action_type', 'unknown')}"]
        }

    async def _completion_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Handle case completion."""
        logger.info("Case completing", case_id=state.get("case_id"))

        return mark_complete(
            state,
            state.get("final_outcome", "Case processing completed")
        )

    async def _failure_node(self, state: OrchestratorState) -> Dict[str, Any]:
        """Handle case failure."""
        logger.error("Case failed", case_id=state.get("case_id"), error=state.get("error"))

        return mark_failed(state, state.get("error", "Unknown error"))

    def _route_after_action(self, state: OrchestratorState) -> str:
        """Route after action coordination."""
        if state.get("error"):
            return "failed"
        if state.get("recovery_needed"):
            return "recovery"
        return "monitoring"

    def _route_after_monitoring(self, state: OrchestratorState) -> str:
        """Route after monitoring."""
        if state.get("is_complete"):
            return "complete"
        if state.get("recovery_needed"):
            return "recovery"
        if state.get("monitoring_iterations", 0) >= 10:
            logger.warning("Max monitoring iterations reached", case_id=state.get("case_id"))
            return "complete"
        return "continue"

    def _route_after_recovery(self, state: OrchestratorState) -> str:
        """Route after recovery."""
        if state.get("error"):
            return "failed"
        if state.get("is_complete"):
            return "complete"
        return "monitoring"

    async def process_case(
        self,
        case_id: str,
        patient_id: str,
        patient_data: Dict[str, Any],
        medication_data: Dict[str, Any],
        payers: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Process a complete case through the workflow.

        Args:
            case_id: Case identifier
            patient_id: Patient identifier
            patient_data: Patient information
            medication_data: Medication request
            payers: List of payers (optional)

        Returns:
            Final state after processing
        """
        initial_state = create_initial_state(
            case_id=case_id,
            patient_id=patient_id,
            patient_data=patient_data,
            medication_data=medication_data,
            payers=payers
        )

        logger.info("Starting case processing", case_id=case_id)

        # Run the graph
        final_state = await self._compiled.ainvoke(initial_state)

        logger.info(
            "Case processing complete",
            case_id=case_id,
            stage=final_state.get("stage", CaseStage.COMPLETED).value,
            outcome=final_state.get("final_outcome")
        )

        return final_state

    async def stream_case_processing(
        self,
        case_id: str,
        patient_id: str,
        patient_data: Dict[str, Any],
        medication_data: Dict[str, Any],
        payers: Optional[list] = None
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Stream case processing events.

        Args:
            case_id: Case identifier
            patient_id: Patient identifier
            patient_data: Patient information
            medication_data: Medication request
            payers: List of payers

        Yields:
            State updates as they occur
        """
        initial_state = create_initial_state(
            case_id=case_id,
            patient_id=patient_id,
            patient_data=patient_data,
            medication_data=medication_data,
            payers=payers
        )

        logger.info("Starting streamed case processing", case_id=case_id)

        async for event in self._compiled.astream(initial_state):
            yield event

    def register_event_handler(self, event_type: str, handler: Callable) -> None:
        """Register a handler for state events."""
        if event_type not in self._event_handlers:
            self._event_handlers[event_type] = []
        self._event_handlers[event_type].append(handler)

    async def resume_after_human_decision(
        self,
        state: Dict[str, Any],
        human_decision: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Resume case processing after human decision has been made.

        This method is called after a human has made a decision via the REST API.
        It injects the human decision into the state and continues processing.

        Args:
            state: Current case state (from database)
            human_decision: The human decision dict with action, reviewer_id, etc.

        Returns:
            Final state after resuming processing
        """
        case_id = state.get("case_id", "unknown")
        action = human_decision.get("action", "")

        logger.info(
            "Resuming after human decision",
            case_id=case_id,
            action=action
        )

        # Inject human decision into state
        state["human_decision"] = human_decision
        state["human_decisions"] = state.get("human_decisions", []) + [human_decision]

        if action == "approve" or action == "override":
            # Continue from strategy generation
            state["requires_human_decision"] = False
            state["human_decision_confirmed"] = True
            state["stage"] = CaseStage.STRATEGY_GENERATION

            # Build a continuation graph starting from strategy_generation
            continuation_graph = self._build_continuation_graph("strategy_generation")
            compiled = continuation_graph.compile()

            final_state = await compiled.ainvoke(state)

        elif action == "reject":
            # Mark as failed
            state["requires_human_decision"] = False
            state["human_decision_confirmed"] = True
            state["error"] = f"Case rejected by human reviewer: {human_decision.get('reason', 'No reason provided')}"
            state["stage"] = CaseStage.FAILED
            state["is_complete"] = True
            state["final_outcome"] = "Case rejected by human reviewer"
            final_state = state

        elif action == "escalate":
            # Keep awaiting - just update state
            state["messages"] = state.get("messages", []) + [
                f"Case escalated by {human_decision.get('reviewer_id')} for senior review"
            ]
            final_state = state

        else:
            logger.warning("Unknown human decision action", action=action)
            final_state = state

        logger.info(
            "Resume after human decision complete",
            case_id=case_id,
            stage=final_state.get("stage", CaseStage.COMPLETED).value if hasattr(final_state.get("stage", CaseStage.COMPLETED), 'value') else str(final_state.get("stage"))
        )

        return final_state

    def _build_continuation_graph(self, start_node: str) -> StateGraph:
        """
        Build a graph for continuing from a specific node.

        Args:
            start_node: The node to start from

        Returns:
            StateGraph configured to continue from start_node
        """
        graph = StateGraph(OrchestratorState)

        # Add only the nodes needed for continuation
        nodes_from_strategy = [
            ("strategy_generation", self._strategy_generation_node),
            ("strategy_selection", self._strategy_selection_node),
            ("action_coordination", self._action_coordination_node),
            ("monitoring", self._monitoring_node),
            ("recovery", self._recovery_node),
            ("completion", self._completion_node),
            ("failure", self._failure_node),
        ]

        for node_name, node_func in nodes_from_strategy:
            graph.add_node(node_name, node_func)

        # Set entry point
        graph.set_entry_point(start_node)

        # Add edges (reuse shared definition)
        graph.add_edge("strategy_generation", "strategy_selection")
        graph.add_edge("strategy_selection", "action_coordination")
        self._add_post_strategy_edges(graph)

        return graph


# Global instance
_case_orchestrator: Optional[CaseOrchestrator] = None


def get_case_orchestrator() -> CaseOrchestrator:
    """Get or create the global case orchestrator."""
    global _case_orchestrator
    if _case_orchestrator is None:
        _case_orchestrator = CaseOrchestrator()
    return _case_orchestrator
