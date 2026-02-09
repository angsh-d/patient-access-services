"""Mock Cigna payer gateway implementation."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional
from uuid import uuid4

from backend.mock_services.payer.payer_interface import (
    PayerGateway,
    PASubmission,
    PAResponse,
    PAStatus
)
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class CignaGateway(PayerGateway):
    """
    Mock Cigna payer gateway for demonstration.
    Simulates Cigna PA submission and response behavior.
    """

    def __init__(self, scenario: str = "happy_path"):
        """
        Initialize Cigna gateway with scenario.

        Args:
            scenario: Scenario to simulate (happy_path, missing_docs, primary_deny, etc.)
        """
        self._scenario = scenario
        self._pa_store: Dict[str, Dict[str, Any]] = {}
        logger.info("Cigna gateway initialized", scenario=scenario)

    @property
    def payer_name(self) -> str:
        return "Cigna"

    def set_scenario(self, scenario: str) -> None:
        """Change the active scenario."""
        self._scenario = scenario
        logger.info("Cigna scenario changed", scenario=scenario)

    async def submit_pa(self, submission: PASubmission) -> PAResponse:
        """Submit PA to Cigna (mock)."""
        reference_number = f"CIG-{datetime.now().strftime('%Y%m%d')}-{str(uuid4())[:8].upper()}"

        logger.info(
            "Cigna PA submitted",
            reference=reference_number,
            medication=submission.medication_name,
            scenario=self._scenario
        )

        # Store submission for status checks
        self._pa_store[reference_number] = {
            "submission": submission,
            "submitted_at": datetime.now(timezone.utc),
            "status": PAStatus.SUBMITTED,
            "status_history": [{"status": PAStatus.SUBMITTED, "timestamp": datetime.now(timezone.utc)}]
        }

        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.SUBMITTED,
            payer_name=self.payer_name,
            message="Prior authorization request received. Expected determination within 5 business days.",
            next_review_date=datetime.now(timezone.utc) + timedelta(days=5)
        )

    async def check_status(self, reference_number: str) -> PAResponse:
        """Check PA status (mock)."""
        if reference_number not in self._pa_store:
            return PAResponse(
                reference_number=reference_number,
                status=PAStatus.PENDING,
                payer_name=self.payer_name,
                message="Reference number not found"
            )

        pa_data = self._pa_store[reference_number]
        submission = pa_data["submission"]

        # Simulate scenario-based responses
        if self._scenario == "happy_path":
            return self._happy_path_response(reference_number, pa_data)
        elif self._scenario == "missing_docs":
            return self._missing_docs_response(reference_number, pa_data)
        elif self._scenario == "primary_deny":
            return self._denial_response(reference_number, pa_data)
        elif self._scenario == "recovery_success":
            return self._recovery_response(reference_number, pa_data)
        else:
            return self._happy_path_response(reference_number, pa_data)

    def _happy_path_response(self, reference_number: str, pa_data: Dict) -> PAResponse:
        """Generate approval response."""
        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.APPROVED,
            payer_name=self.payer_name,
            message="Prior authorization approved.",
            approval_details={
                "effective_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "expiration_date": (datetime.now(timezone.utc) + timedelta(days=180)).strftime("%Y-%m-%d"),
                "approved_quantity": "400mg per infusion",
                "approved_frequency": "Every 8 weeks after induction"
            },
            quantity_approved="400mg",
            duration_approved="6 months"
        )

    def _missing_docs_response(self, reference_number: str, pa_data: Dict) -> PAResponse:
        """Generate pending info response."""
        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.PENDING_INFO,
            payer_name=self.payer_name,
            message="Additional documentation required to complete review.",
            required_documents=[
                "TB screening results (QuantiFERON-TB Gold)",
                "Recent disease activity score (DAS28)",
                "Documentation of methotrexate trial duration"
            ],
            next_review_date=datetime.now(timezone.utc) + timedelta(days=10)
        )

    def _denial_response(self, reference_number: str, pa_data: Dict) -> PAResponse:
        """Generate denial response."""
        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.DENIED,
            payer_name=self.payer_name,
            message="Prior authorization denied. See denial reason for details.",
            denial_reason="Step therapy requirements not met. Documentation does not demonstrate adequate trial of methotrexate at optimal dose (15-25mg weekly) for minimum 12 weeks.",
            denial_code="STH-001",
            appeal_deadline=datetime.now(timezone.utc) + timedelta(days=180)
        )

    def _recovery_response(self, reference_number: str, pa_data: Dict) -> PAResponse:
        """Generate response for recovery scenario (appeal approved)."""
        history = pa_data.get("status_history", [])
        if len(history) < 2:
            # First check - denial
            pa_data["status_history"].append({"status": PAStatus.DENIED, "timestamp": datetime.now(timezone.utc)})
            return self._denial_response(reference_number, pa_data)
        else:
            # After appeal - approved
            return PAResponse(
                reference_number=reference_number,
                status=PAStatus.APPEAL_APPROVED,
                payer_name=self.payer_name,
                message="Appeal approved following peer-to-peer review.",
                approval_details={
                    "effective_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "expiration_date": (datetime.now(timezone.utc) + timedelta(days=180)).strftime("%Y-%m-%d"),
                    "notes": "Approved based on clinical justification provided during P2P review"
                },
                quantity_approved="400mg",
                duration_approved="6 months"
            )

    async def submit_documents(
        self,
        reference_number: str,
        documents: List[Dict[str, Any]]
    ) -> PAResponse:
        """Submit additional documents (mock)."""
        logger.info(
            "Documents submitted to Cigna",
            reference=reference_number,
            doc_count=len(documents)
        )

        if reference_number in self._pa_store:
            self._pa_store[reference_number]["documents_submitted"] = documents
            self._pa_store[reference_number]["docs_submitted_at"] = datetime.now(timezone.utc)

        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.PENDING,
            payer_name=self.payer_name,
            message=f"Received {len(documents)} document(s). Request under review.",
            next_review_date=datetime.now(timezone.utc) + timedelta(days=3)
        )

    async def submit_appeal(
        self,
        reference_number: str,
        appeal_letter: str,
        supporting_documents: List[Dict[str, Any]]
    ) -> PAResponse:
        """Submit appeal (mock)."""
        appeal_reference = f"{reference_number}-APL"

        logger.info(
            "Appeal submitted to Cigna",
            original_reference=reference_number,
            appeal_reference=appeal_reference
        )

        if reference_number in self._pa_store:
            self._pa_store[reference_number]["appeal_submitted"] = True
            self._pa_store[reference_number]["appeal_reference"] = appeal_reference

        return PAResponse(
            reference_number=appeal_reference,
            status=PAStatus.APPEAL_PENDING,
            payer_name=self.payer_name,
            message="Appeal received. Medical director review scheduled.",
            next_review_date=datetime.now(timezone.utc) + timedelta(days=10)
        )

    async def request_peer_to_peer(
        self,
        reference_number: str,
        prescriber_availability: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Request P2P review (mock)."""
        logger.info(
            "P2P requested with Cigna",
            reference=reference_number,
            availability_slots=len(prescriber_availability)
        )

        # Mock P2P scheduling
        scheduled_time = datetime.now(timezone.utc) + timedelta(days=2, hours=10)

        return {
            "reference_number": reference_number,
            "p2p_scheduled": True,
            "scheduled_datetime": scheduled_time.isoformat(),
            "medical_director": "Dr. Michael Thompson, MD",
            "phone_number": "1-800-CIGNA-P2P",
            "confirmation_code": f"P2P-{str(uuid4())[:6].upper()}",
            "instructions": "Please have patient records and clinical notes available during the call."
        }
