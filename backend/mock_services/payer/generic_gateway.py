"""Generic mock payer gateway — configurable for any payer name."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any
from uuid import uuid4

from backend.mock_services.payer.payer_interface import (
    PayerGateway,
    PASubmission,
    PAResponse,
    PAStatus
)
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class GenericPayerGateway(PayerGateway):
    """
    Configurable mock payer gateway for any payer.
    Used for payers that don't have a dedicated gateway implementation.
    Supports scenario-driven behavior identical to Cigna/UHC gateways.
    """

    def __init__(self, name: str, prefix: str = "GEN", scenario: str = "happy_path"):
        self._name = name
        self._prefix = prefix
        self._scenario = scenario
        self._pa_store: Dict[str, Dict[str, Any]] = {}
        logger.info(f"{name} gateway initialized", scenario=scenario)

    @property
    def payer_name(self) -> str:
        return self._name

    def set_scenario(self, scenario: str) -> None:
        self._scenario = scenario
        logger.info(f"{self._name} scenario changed", scenario=scenario)

    async def submit_pa(self, submission: PASubmission) -> PAResponse:
        ref = f"{self._prefix}-{datetime.now().strftime('%Y%m%d')}-{str(uuid4())[:8].upper()}"
        logger.info(f"{self._name} PA submitted", reference=ref, medication=submission.medication_name)

        self._pa_store[ref] = {
            "submission": submission,
            "submitted_at": datetime.now(timezone.utc),
            "status": PAStatus.SUBMITTED,
            "status_history": [{"status": PAStatus.SUBMITTED, "timestamp": datetime.now(timezone.utc)}],
        }

        if self._scenario == "primary_deny":
            return PAResponse(
                reference_number=ref,
                status=PAStatus.DENIED,
                payer_name=self._name,
                message=f"{self._name} has denied this prior authorization request.",
                denial_reason="Does not meet policy criteria",
                denial_code="AUTH-DENY-001",
                appeal_deadline=datetime.now(timezone.utc) + timedelta(days=60),
            )

        if self._scenario == "pending_info":
            return PAResponse(
                reference_number=ref,
                status=PAStatus.PENDING_INFO,
                payer_name=self._name,
                message=f"{self._name} requires additional documentation.",
                required_documents=["Additional clinical documentation"],
            )

        # Default: approve
        return PAResponse(
            reference_number=ref,
            status=PAStatus.APPROVED,
            payer_name=self._name,
            message=f"{self._name} has approved this prior authorization request.",
            approval_details={"effective_date": datetime.now(timezone.utc).isoformat()},
            quantity_approved="As prescribed",
            duration_approved="12 months",
        )

    async def check_status(self, reference_number: str) -> PAResponse:
        stored = self._pa_store.get(reference_number)
        if not stored:
            return PAResponse(
                reference_number=reference_number,
                status=PAStatus.PENDING,
                payer_name=self._name,
                message="PA is under review",
            )
        return PAResponse(
            reference_number=reference_number,
            status=stored["status"],
            payer_name=self._name,
        )

    async def submit_documents(self, reference_number: str, documents: List[Dict[str, Any]]) -> PAResponse:
        logger.info(f"{self._name} documents received", reference=reference_number, count=len(documents))
        return PAResponse(
            reference_number=reference_number,
            status=PAStatus.PENDING,
            payer_name=self._name,
            message="Documents received and under review",
        )

    async def submit_appeal(self, reference_number: str, appeal_letter: str, supporting_documents: List[Dict[str, Any]]) -> PAResponse:
        logger.info(f"{self._name} appeal submitted", reference=reference_number)
        if self._scenario == "recovery_success":
            return PAResponse(
                reference_number=f"{reference_number}-APL",
                status=PAStatus.APPEAL_APPROVED,
                payer_name=self._name,
                message="Appeal approved",
            )
        return PAResponse(
            reference_number=f"{reference_number}-APL",
            status=PAStatus.APPEAL_PENDING,
            payer_name=self._name,
            message="Appeal is under review",
        )

    async def request_peer_to_peer(self, reference_number: str, prescriber_availability: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            "status": "scheduled",
            "payer": self._name,
            "reference": reference_number,
            "scheduled_time": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        }
