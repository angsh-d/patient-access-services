"""Mock UHC payer gateway implementation."""
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


class UHCGateway(PayerGateway):
    """
    Mock UHC (UnitedHealthcare) payer gateway for demonstration.
    Simulates UHC PA submission and response behavior.
    """

    def __init__(self, scenario: str = "happy_path"):
        """
        Initialize UHC gateway with scenario.

        Args:
            scenario: Scenario to simulate
        """
        self._scenario = scenario
        self._pa_store: Dict[str, Dict[str, Any]] = {}
        logger.info("UHC gateway initialized", scenario=scenario)

    @property
    def payer_name(self) -> str:
        return "UHC"

    def set_scenario(self, scenario: str) -> None:
        """Change the active scenario."""
        self._scenario = scenario
        logger.info("UHC scenario changed", scenario=scenario)

    async def submit_pa(self, submission: PASubmission) -> PAResponse:
        """Submit PA to UHC (mock)."""
        reference_number = f"UHC-{datetime.now().strftime('%Y%m%d')}-{str(uuid4())[:8].upper()}"

        logger.info(
            "UHC PA submitted",
            reference=reference_number,
            medication=submission.medication_name,
            scenario=self._scenario
        )

        # Store submission
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
            message="Authorization request submitted successfully. Tracking number assigned.",
            next_review_date=datetime.now(timezone.utc) + timedelta(days=3)
        )

    async def check_status(self, reference_number: str) -> PAResponse:
        """Check PA status (mock)."""
        if reference_number not in self._pa_store:
            return PAResponse(
                reference_number=reference_number,
                status=PAStatus.PENDING,
                payer_name=self.payer_name,
                message="Authorization not found in system"
            )

        pa_data = self._pa_store[reference_number]

        # Simulate scenario-based responses
        if self._scenario == "happy_path":
            return self._happy_path_response(reference_number, pa_data)
        elif self._scenario == "missing_docs":
            return self._tb_screening_request(reference_number, pa_data)
        elif self._scenario == "primary_deny":
            # UHC approves when Cigna denies (for optimized strategy demo)
            return self._happy_path_response(reference_number, pa_data)
        elif self._scenario == "secondary_deny":
            return self._biosimilar_redirect(reference_number, pa_data)
        else:
            return self._happy_path_response(reference_number, pa_data)

    def _happy_path_response(self, reference_number: str, pa_data: Dict) -> PAResponse:
        """Generate approval response."""
        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.APPROVED,
            payer_name=self.payer_name,
            message="Authorization approved. Please note biosimilar preference.",
            approval_details={
                "effective_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "expiration_date": (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%Y-%m-%d"),
                "approved_quantity": "Up to 10mg/kg per infusion",
                "approved_frequency": "Per FDA labeling",
                "preferred_product": "Inflectra or Renflexis (biosimilar)",
                "remicade_approved": True,
                "notes": "Remicade approved; biosimilar preferred but not required"
            },
            quantity_approved="10mg/kg max",
            duration_approved="12 months"
        )

    def _tb_screening_request(self, reference_number: str, pa_data: Dict) -> PAResponse:
        """Generate TB screening request."""
        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.PENDING_INFO,
            payer_name=self.payer_name,
            message="TB screening documentation required per policy.",
            required_documents=[
                "TB QuantiFERON-Gold or T-SPOT.TB result within 90 days",
                "If positive: documentation of INH prophylaxis or treatment"
            ],
            next_review_date=datetime.now(timezone.utc) + timedelta(days=14)
        )

    def _biosimilar_redirect(self, reference_number: str, pa_data: Dict) -> PAResponse:
        """Generate biosimilar requirement response."""
        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.DENIED,
            payer_name=self.payer_name,
            message="Reference product denied. Biosimilar required.",
            denial_reason="Per UHC policy, biosimilar infliximab products (Inflectra, Renflexis, Avsola) are preferred. Remicade requires clinical justification for biosimilar exception.",
            denial_code="BIO-001",
            approval_details={
                "alternative_approved": True,
                "approved_alternatives": ["Inflectra", "Renflexis", "Avsola"],
                "appeal_available": True
            },
            appeal_deadline=datetime.now(timezone.utc) + timedelta(days=180)
        )

    async def submit_documents(
        self,
        reference_number: str,
        documents: List[Dict[str, Any]]
    ) -> PAResponse:
        """Submit additional documents (mock)."""
        logger.info(
            "Documents submitted to UHC",
            reference=reference_number,
            doc_count=len(documents)
        )

        if reference_number in self._pa_store:
            self._pa_store[reference_number]["documents_submitted"] = documents

        # After docs submitted, move toward approval
        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.PENDING,
            payer_name=self.payer_name,
            message="Documentation received. Under clinical review.",
            next_review_date=datetime.now(timezone.utc) + timedelta(days=2)
        )

    async def submit_appeal(
        self,
        reference_number: str,
        appeal_letter: str,
        supporting_documents: List[Dict[str, Any]]
    ) -> PAResponse:
        """Submit appeal (mock)."""
        appeal_reference = f"{reference_number}-APPEAL"

        logger.info(
            "Appeal submitted to UHC",
            original_reference=reference_number,
            appeal_reference=appeal_reference
        )

        if reference_number in self._pa_store:
            self._pa_store[reference_number]["appeal_submitted"] = True

        return PAResponse(
            reference_number=appeal_reference,
            status=PAStatus.APPEAL_PENDING,
            payer_name=self.payer_name,
            message="Appeal accepted for review. Expedited review if urgent.",
            next_review_date=datetime.now(timezone.utc) + timedelta(days=7)
        )

    async def request_peer_to_peer(
        self,
        reference_number: str,
        prescriber_availability: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Request P2P review (mock)."""
        logger.info(
            "P2P requested with UHC",
            reference=reference_number
        )

        scheduled_time = datetime.now(timezone.utc) + timedelta(days=1, hours=14)

        return {
            "reference_number": reference_number,
            "p2p_scheduled": True,
            "scheduled_datetime": scheduled_time.isoformat(),
            "medical_director": "Dr. Jennifer Walsh, MD, FACP",
            "phone_number": "1-888-UHC-P2P-RX",
            "confirmation_code": f"UHC-P2P-{str(uuid4())[:6].upper()}",
            "video_link": "https://uhc-p2p.webex.com/meet/review",
            "instructions": "Video preferred. Have EHR access ready for screen share."
        }
