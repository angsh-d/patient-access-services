"""Action coordinator agent for executing workflow actions."""
import copy
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from backend.models.actions import ActionRequest, ActionResult
from backend.models.enums import ActionType, PayerStatus
from backend.mock_services.payer import PASubmission, PAResponse, CignaGateway, UHCGateway, GenericPayerGateway
from backend.mock_services.scenarios import get_scenario_manager
from backend.agents.recovery_agent import get_recovery_agent
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class ActionCoordinator:
    """
    Agent responsible for coordinating and executing workflow actions.
    Interfaces with payer gateways and manages action sequences.
    """

    def __init__(self):
        """Initialize the action coordinator."""
        self._payer_gateways: Dict[str, Any] = {}
        self._initialize_gateways()
        logger.info("Action coordinator initialized")

    def _initialize_gateways(self) -> None:
        """Initialize payer gateway instances.

        Creates dedicated gateways for payers with custom implementations,
        and auto-creates generic gateways on demand for any other payer.
        """
        scenario_manager = get_scenario_manager()

        # Dedicated gateway implementations
        self._payer_gateways["Cigna"] = CignaGateway()
        self._payer_gateways["UHC"] = UHCGateway()

        # Register gateways with scenario manager
        for payer_name, gateway in self._payer_gateways.items():
            scenario_manager.register_gateway(payer_name, gateway)

    def get_gateway(self, payer_name: str) -> Any:
        """Get the gateway for a specific payer.

        If no dedicated gateway exists, creates a GenericPayerGateway on demand.
        This ensures all payers (including BCBS, Aetna, etc.) can use the
        action coordination workflow.
        """
        gateway = self._payer_gateways.get(payer_name)
        if gateway is None:
            # Auto-create generic gateway for unknown payers
            prefix = payer_name[:3].upper().replace(" ", "")
            gateway = GenericPayerGateway(name=payer_name, prefix=prefix)
            self._payer_gateways[payer_name] = gateway
            scenario_manager = get_scenario_manager()
            scenario_manager.register_gateway(payer_name, gateway)
            logger.info("Auto-created generic gateway for payer", payer_name=payer_name)
        return gateway

    async def execute_next_action(
        self,
        state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute the next action based on strategy and current state.

        Args:
            state: Current orchestrator state

        Returns:
            State updates from action execution
        """
        selected_strategy = state.get("selected_strategy")
        if not selected_strategy:
            return {"error": "No strategy selected"}

        payer_states = state.get("payer_states", {})
        payer_sequence = selected_strategy.get("payer_sequence", [])

        # Find next payer to submit to
        for payer_name in payer_sequence:
            payer_state = payer_states.get(payer_name, {})
            status = payer_state.get("status", "not_submitted")

            if status == "not_submitted":
                return await self._execute_pa_submission(state, payer_name)
            elif status == "pending_info":
                return await self._handle_pending_info(state, payer_name)

        # All submissions done, check for monitoring needs
        return {
            "action_type": "monitoring",
            "message": "All submissions complete, monitoring responses"
        }

    async def _execute_pa_submission(
        self,
        state: Dict[str, Any],
        payer_name: str
    ) -> Dict[str, Any]:
        """Execute a PA submission to a payer."""
        logger.info("Submitting PA", payer=payer_name, case_id=state.get("case_id"))

        gateway = self.get_gateway(payer_name)
        if not gateway:
            return {"error": f"No gateway available for {payer_name}"}

        # Build submission from state
        patient_data = state.get("patient_data", {})
        medication_data = state.get("medication_data", {})
        med_request = medication_data.get("medication_request", medication_data)

        submission = PASubmission(
            case_id=state.get("case_id", ""),
            patient_member_id=self._get_member_id(patient_data, payer_name),
            patient_name=self._get_patient_name(patient_data),
            medication_name=med_request.get("medication_name", ""),
            medication_ndc=med_request.get("ndc_code", ""),
            diagnosis_codes=self._get_diagnosis_codes(patient_data),
            prescriber_npi=patient_data.get("prescriber", {}).get("npi", ""),
            prescriber_name=patient_data.get("prescriber", {}).get("name", ""),
            clinical_rationale=med_request.get("clinical_rationale", ""),
            prior_treatments=patient_data.get("clinical_profile", {}).get("prior_treatments", []),
            lab_results=patient_data.get("clinical_profile", {}).get("lab_results", [])
        )

        # Submit to gateway
        response = await gateway.submit_pa(submission)

        # Update payer state (deep copy to avoid mutating orchestrator state)
        updated_payer_states = copy.deepcopy(state.get("payer_states", {}))
        updated_payer_states[payer_name] = {
            "payer_name": payer_name,
            "status": response.to_payer_status_value(),
            "reference_number": response.reference_number,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "response_details": response.to_dict(),
            "required_documents": response.required_documents or [],
            "denial_reason": response.denial_reason,
            "appeal_deadline": response.appeal_deadline.isoformat() if response.appeal_deadline else None
        }

        # Update payer responses
        updated_responses = dict(state.get("payer_responses", {}))
        updated_responses[payer_name] = response.to_dict()

        return {
            "action_type": ActionType.SUBMIT_PA.value,
            "target_payer": payer_name,
            "payer_states": updated_payer_states,
            "payer_responses": updated_responses,
            "completed_actions": [{
                "action_type": ActionType.SUBMIT_PA.value,
                "payer": payer_name,
                "reference_number": response.reference_number,
                "status": response.to_payer_status_value(),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }],
            "messages": [f"PA submitted to {payer_name}: {response.reference_number}"]
        }

    async def _handle_pending_info(
        self,
        state: Dict[str, Any],
        payer_name: str
    ) -> Dict[str, Any]:
        """Handle a payer requesting additional information."""
        logger.info("Handling pending info request", payer=payer_name)

        payer_state = state.get("payer_states", {}).get(payer_name, {})
        response_details = payer_state.get("response_details", {})
        required_docs = response_details.get("required_documents", [])

        if not required_docs:
            return {
                "action_type": "check_status",
                "message": f"No documents requested by {payer_name}"
            }

        # Simulate document submission
        gateway = self.get_gateway(payer_name)
        if gateway:
            reference = payer_state.get("reference_number", "")
            doc_response = await gateway.submit_documents(
                reference_number=reference,
                documents=[{"type": doc, "submitted": True} for doc in required_docs]
            )

            # Update state (deep copy to avoid mutating orchestrator state)
            updated_payer_states = copy.deepcopy(state.get("payer_states", {}))
            updated_payer_states[payer_name]["status"] = doc_response.to_payer_status_value()
            updated_payer_states[payer_name]["last_updated"] = datetime.now(timezone.utc).isoformat()

            return {
                "action_type": ActionType.SUBMIT_DOCUMENTS.value,
                "target_payer": payer_name,
                "payer_states": updated_payer_states,
                "completed_actions": [{
                    "action_type": ActionType.SUBMIT_DOCUMENTS.value,
                    "payer": payer_name,
                    "documents_submitted": required_docs,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }],
                "messages": [f"Submitted {len(required_docs)} documents to {payer_name}"]
            }

        return {"error": f"Cannot submit documents to {payer_name}"}

    async def execute_recovery_action(
        self,
        state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a recovery action (appeal, P2P, etc.) using the RecoveryAgent.

        The RecoveryAgent classifies the denial, generates recovery strategies,
        and selects the optimal approach before execution.
        """
        logger.info("Executing recovery", case_id=state.get("case_id"))

        # Find denied payer
        payer_states = state.get("payer_states", {})
        denied_payer = None
        denial_response = None

        for payer_name, payer_state in payer_states.items():
            if payer_state.get("status") == "denied":
                denied_payer = payer_name
                denial_response = payer_state.get("response_details", {})
                break

        if not denied_payer:
            return {"message": "No denial found for recovery"}

        gateway = self.get_gateway(denied_payer)
        if not gateway:
            return {"error": f"No gateway for {denied_payer}"}

        reference = payer_states[denied_payer].get("reference_number", "")

        # Use RecoveryAgent for intelligent recovery
        recovery_agent = get_recovery_agent()

        # Build case state for recovery agent
        case_state = {
            "case_id": state.get("case_id", ""),
            "patient_data": state.get("patient_data", {}),
            "medication_data": state.get("medication_data", {}),
            "documentation_gaps": state.get("documentation_gaps", []),
            "payers": list(payer_states.keys()),
            "recovery_payer": denied_payer,
            "recovery_reason": state.get("recovery_reason", "Payer denial")
        }

        # Classify the denial
        classification = recovery_agent.classify_denial(denial_response, case_state)

        logger.info(
            "Denial classified",
            denial_type=classification.denial_type,
            is_recoverable=classification.is_recoverable,
            root_cause=classification.root_cause
        )

        if not classification.is_recoverable:
            return {
                "action_type": "no_recovery_path",
                "target_payer": denied_payer,
                "denial_classification": {
                    "type": classification.denial_type,
                    "root_cause": classification.root_cause,
                    "is_recoverable": False
                },
                "recovery_needed": False,
                "is_complete": True,
                "final_outcome": f"Denial not recoverable: {classification.denial_type}",
                "messages": [f"No recovery path for {denied_payer}: {classification.denial_type}"]
            }

        # Generate recovery strategy options
        recovery_options = recovery_agent.generate_recovery_strategies(
            classification=classification,
            case_state=case_state,
            payer_name=denied_payer
        )

        # Select the best recovery strategy
        recovery_strategy = recovery_agent.select_recovery_strategy(recovery_options, case_state)

        logger.info(
            "Recovery strategy selected",
            option=recovery_strategy.selected_option,
            parallel=recovery_strategy.parallel_actions
        )

        # Execute based on selected option
        if recovery_strategy.selected_option in ["PEER_TO_PEER_REVIEW"]:
            return await self._execute_p2p_recovery(
                state, denied_payer, gateway, reference, classification, recovery_strategy
            )
        elif recovery_strategy.selected_option in ["URGENT_DOCUMENT_CHASE", "PARALLEL_RECOVERY"]:
            return await self._execute_document_chase_recovery(
                state, denied_payer, gateway, reference, classification, recovery_strategy
            )
        else:
            # Default: submit written appeal
            return await self._execute_appeal_recovery(
                state, denied_payer, gateway, reference, classification, recovery_strategy
            )

    async def _execute_appeal_recovery(
        self,
        state: Dict[str, Any],
        payer_name: str,
        gateway: Any,
        reference: str,
        classification: Any,
        recovery_strategy: Any
    ) -> Dict[str, Any]:
        """Execute a written appeal recovery action."""
        logger.info("Executing written appeal", payer=payer_name)

        # Generate appeal strategy using Claude (for complex cases)
        recovery_agent = get_recovery_agent()
        denial_response = state.get("payer_states", {}).get(payer_name, {}).get("response_details", {})

        try:
            appeal_strategy = await recovery_agent.generate_appeal_strategy(
                denial_response=denial_response,
                case_state={
                    "case_id": state.get("case_id"),
                    "patient_data": state.get("patient_data"),
                    "medication_data": state.get("medication_data"),
                    "available_documents": state.get("documentation_gaps", [])
                },
                payer_name=payer_name
            )

            appeal_letter = f"""
Clinical Appeal for Prior Authorization
Patient Case ID: {state.get('case_id')}

Primary Argument: {appeal_strategy.primary_clinical_argument}

Supporting Arguments:
{chr(10).join('- ' + arg for arg in appeal_strategy.supporting_arguments)}

Evidence Cited:
{chr(10).join('- ' + ev for ev in appeal_strategy.evidence_to_cite)}

Success Probability Assessment: {appeal_strategy.success_probability:.0%}
"""
        except Exception as e:
            logger.warning("Claude appeal strategy generation failed, using basic appeal", error=str(e))
            appeal_letter = "Appeal based on clinical necessity and prior treatment failures."

        # Submit appeal
        appeal_response = await gateway.submit_appeal(
            reference_number=reference,
            appeal_letter=appeal_letter,
            supporting_documents=[{"type": "medical_records"}, {"type": "lab_results"}]
        )

        # Update state
        payer_states = state.get("payer_states", {})
        updated_payer_states = copy.deepcopy(payer_states)
        updated_payer_states[payer_name]["status"] = appeal_response.to_payer_status_value()
        updated_payer_states[payer_name]["appeal_reference"] = appeal_response.reference_number
        updated_payer_states[payer_name]["last_updated"] = datetime.now(timezone.utc).isoformat()

        return {
            "action_type": ActionType.SUBMIT_APPEAL.value,
            "target_payer": payer_name,
            "payer_states": updated_payer_states,
            "recovery_needed": False,
            "denial_classification": {
                "type": classification.denial_type,
                "root_cause": classification.root_cause,
                "linked_gap": classification.linked_intake_gap
            },
            "recovery_strategy": {
                "selected_option": recovery_strategy.selected_option,
                "reasoning": recovery_strategy.selection_reasoning
            },
            "completed_actions": [{
                "action_type": ActionType.SUBMIT_APPEAL.value,
                "payer": payer_name,
                "appeal_reference": appeal_response.reference_number,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }],
            "messages": [f"Written appeal submitted to {payer_name}: {appeal_response.reference_number}"]
        }

    async def _execute_p2p_recovery(
        self,
        state: Dict[str, Any],
        payer_name: str,
        gateway: Any,
        reference: str,
        classification: Any,
        recovery_strategy: Any
    ) -> Dict[str, Any]:
        """Execute a peer-to-peer review recovery action."""
        logger.info("Executing P2P review", payer=payer_name)

        # For P2P, we prepare materials and schedule the review
        # This is simulated since we don't have actual P2P scheduling

        payer_states = state.get("payer_states", {})
        updated_payer_states = copy.deepcopy(payer_states)
        updated_payer_states[payer_name]["status"] = "p2p_scheduled"
        updated_payer_states[payer_name]["p2p_scheduled"] = True
        updated_payer_states[payer_name]["last_updated"] = datetime.now(timezone.utc).isoformat()

        return {
            "action_type": "schedule_p2p",
            "target_payer": payer_name,
            "payer_states": updated_payer_states,
            "recovery_needed": False,
            "denial_classification": {
                "type": classification.denial_type,
                "root_cause": classification.root_cause
            },
            "recovery_strategy": {
                "selected_option": recovery_strategy.selected_option,
                "reasoning": recovery_strategy.selection_reasoning
            },
            "completed_actions": [{
                "action_type": "schedule_p2p",
                "payer": payer_name,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }],
            "messages": [f"P2P review scheduled with {payer_name}"]
        }

    async def _execute_document_chase_recovery(
        self,
        state: Dict[str, Any],
        payer_name: str,
        gateway: Any,
        reference: str,
        classification: Any,
        recovery_strategy: Any
    ) -> Dict[str, Any]:
        """Execute document chase recovery action."""
        logger.info("Executing document chase", payer=payer_name, linked_gap=classification.linked_intake_gap)

        # Identify missing documents from the linked intake gap
        documentation_gaps = state.get("documentation_gaps", [])
        missing_docs = []

        if classification.linked_intake_gap:
            for gap in documentation_gaps:
                if gap.get("gap_id") == classification.linked_intake_gap:
                    missing_docs.append(gap.get("description", "Unknown document"))

        if not missing_docs:
            missing_docs = ["Additional clinical documentation"]

        payer_states = state.get("payer_states", {})
        updated_payer_states = copy.deepcopy(payer_states)
        updated_payer_states[payer_name]["status"] = "document_chase"
        updated_payer_states[payer_name]["pending_documents"] = missing_docs
        updated_payer_states[payer_name]["last_updated"] = datetime.now(timezone.utc).isoformat()

        return {
            "action_type": "document_chase",
            "target_payer": payer_name,
            "payer_states": updated_payer_states,
            "recovery_needed": True,  # Still needs recovery after docs obtained
            "denial_classification": {
                "type": classification.denial_type,
                "root_cause": classification.root_cause,
                "linked_gap": classification.linked_intake_gap
            },
            "recovery_strategy": {
                "selected_option": recovery_strategy.selected_option,
                "reasoning": recovery_strategy.selection_reasoning,
                "parallel_actions": recovery_strategy.parallel_actions
            },
            "pending_documents": missing_docs,
            "completed_actions": [{
                "action_type": "document_chase",
                "payer": payer_name,
                "documents_requested": missing_docs,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }],
            "messages": [f"Document chase initiated for {payer_name}: {', '.join(missing_docs)}"]
        }

    async def check_payer_status(
        self,
        state: Dict[str, Any],
        payer_name: str
    ) -> Dict[str, Any]:
        """Check current status with a payer."""
        gateway = self.get_gateway(payer_name)
        if not gateway:
            return {"error": f"No gateway for {payer_name}"}

        payer_state = state.get("payer_states", {}).get(payer_name, {})
        reference = payer_state.get("reference_number")

        if not reference:
            return {"error": f"No reference number for {payer_name}"}

        response = await gateway.check_status(reference)

        # Update state
        updated_payer_states = copy.deepcopy(state.get("payer_states", {}))
        current_state = updated_payer_states.get(payer_name, {})
        updated_payer_states[payer_name] = {
            "payer_name": payer_name,
            "status": response.to_payer_status_value(),
            "reference_number": current_state.get("reference_number") or response.reference_number,
            "submitted_at": current_state.get("submitted_at"),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "response_details": response.to_dict(),
            "required_documents": response.required_documents or [],
            "denial_reason": response.denial_reason,
            "appeal_deadline": response.appeal_deadline.isoformat() if response.appeal_deadline else None
        }

        # Check if response triggers recovery
        recovery_needed = response.to_payer_status_value() == "denied" and response.appeal_deadline is not None

        return {
            "action_type": ActionType.CHECK_STATUS.value,
            "target_payer": payer_name,
            "payer_states": updated_payer_states,
            "payer_responses": {
                **state.get("payer_responses", {}),
                payer_name: response.to_dict()
            },
            "recovery_needed": recovery_needed,
            "recovery_reason": f"{payer_name} denied" if recovery_needed else None,
            "messages": [f"{payer_name} status: {response.to_payer_status_value()}"]
        }

    def _get_member_id(self, patient_data: Dict[str, Any], payer_name: str) -> str:
        """Get member ID for a payer."""
        insurance = patient_data.get("insurance", {})
        if insurance.get("primary", {}).get("payer_name") == payer_name:
            return insurance["primary"].get("member_id", "")
        if insurance.get("secondary", {}).get("payer_name") == payer_name:
            return insurance["secondary"].get("member_id", "")
        return ""

    def _get_patient_name(self, patient_data: Dict[str, Any]) -> str:
        """Get patient full name."""
        demo = patient_data.get("demographics", {})
        return f"{demo.get('first_name', '')} {demo.get('last_name', '')}".strip()

    def _get_diagnosis_codes(self, patient_data: Dict[str, Any]) -> List[str]:
        """Get diagnosis codes."""
        clinical = patient_data.get("clinical_profile", {})
        diagnoses = clinical.get("diagnoses", [])
        return [d.get("icd10_code", "") for d in diagnoses if d.get("icd10_code")]


# Global instance
_action_coordinator: Optional[ActionCoordinator] = None


def get_action_coordinator() -> ActionCoordinator:
    """Get or create the global action coordinator."""
    global _action_coordinator
    if _action_coordinator is None:
        _action_coordinator = ActionCoordinator()
    return _action_coordinator
