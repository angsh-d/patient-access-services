"""Abstract payer gateway interface."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Any


class PAStatus(str, Enum):
    """Prior Authorization status values."""
    SUBMITTED = "submitted"
    PENDING = "pending"
    PENDING_INFO = "pending_info"
    APPROVED = "approved"
    DENIED = "denied"
    APPEAL_PENDING = "appeal_pending"
    APPEAL_APPROVED = "appeal_approved"
    APPEAL_DENIED = "appeal_denied"


@dataclass
class PASubmission:
    """Prior authorization submission request."""
    case_id: str
    patient_member_id: str
    patient_name: str
    medication_name: str
    medication_ndc: str
    diagnosis_codes: List[str]
    prescriber_npi: str
    prescriber_name: str
    clinical_rationale: str
    supporting_documents: List[Dict[str, Any]] = field(default_factory=list)
    prior_treatments: List[Dict[str, Any]] = field(default_factory=list)
    lab_results: List[Dict[str, Any]] = field(default_factory=list)
    urgency: str = "standard"  # standard, expedited


@dataclass
class PAResponse:
    """Prior authorization response from payer."""
    reference_number: str
    status: PAStatus
    payer_name: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    message: Optional[str] = None
    approval_details: Optional[Dict[str, Any]] = None
    denial_reason: Optional[str] = None
    denial_code: Optional[str] = None
    required_documents: List[str] = field(default_factory=list)
    appeal_deadline: Optional[datetime] = None
    next_review_date: Optional[datetime] = None
    quantity_approved: Optional[str] = None
    duration_approved: Optional[str] = None

    def to_payer_status_value(self) -> str:
        """Map PAStatus to PayerStatus string value for state consistency."""
        from backend.models.enums import PayerStatus
        mapping = {
            PAStatus.SUBMITTED: PayerStatus.SUBMITTED,
            PAStatus.PENDING: PayerStatus.UNDER_REVIEW,
            PAStatus.PENDING_INFO: PayerStatus.PENDING_INFO,
            PAStatus.APPROVED: PayerStatus.APPROVED,
            PAStatus.DENIED: PayerStatus.DENIED,
            PAStatus.APPEAL_PENDING: PayerStatus.APPEAL_SUBMITTED,
            PAStatus.APPEAL_APPROVED: PayerStatus.APPEAL_APPROVED,
            PAStatus.APPEAL_DENIED: PayerStatus.APPEAL_DENIED,
        }
        payer_status = mapping.get(self.status)
        return payer_status.value if payer_status else self.status.value

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "reference_number": self.reference_number,
            "status": self.status.value,
            "payer_name": self.payer_name,
            "timestamp": self.timestamp.isoformat(),
            "message": self.message,
            "approval_details": self.approval_details,
            "denial_reason": self.denial_reason,
            "denial_code": self.denial_code,
            "required_documents": self.required_documents,
            "appeal_deadline": self.appeal_deadline.isoformat() if self.appeal_deadline else None,
            "next_review_date": self.next_review_date.isoformat() if self.next_review_date else None,
            "quantity_approved": self.quantity_approved,
            "duration_approved": self.duration_approved,
        }


class PayerGateway(ABC):
    """Abstract base class for payer gateway implementations."""

    @property
    @abstractmethod
    def payer_name(self) -> str:
        """Name of the payer."""
        pass

    @abstractmethod
    async def submit_pa(self, submission: PASubmission) -> PAResponse:
        """
        Submit a prior authorization request.

        Args:
            submission: PA submission details

        Returns:
            PA response with reference number and initial status
        """
        pass

    @abstractmethod
    async def check_status(self, reference_number: str) -> PAResponse:
        """
        Check the status of a prior authorization.

        Args:
            reference_number: PA reference number

        Returns:
            Current PA status
        """
        pass

    @abstractmethod
    async def submit_documents(
        self,
        reference_number: str,
        documents: List[Dict[str, Any]]
    ) -> PAResponse:
        """
        Submit additional documents for a PA request.

        Args:
            reference_number: PA reference number
            documents: List of documents to submit

        Returns:
            Updated PA response
        """
        pass

    @abstractmethod
    async def submit_appeal(
        self,
        reference_number: str,
        appeal_letter: str,
        supporting_documents: List[Dict[str, Any]]
    ) -> PAResponse:
        """
        Submit an appeal for a denied PA.

        Args:
            reference_number: Original PA reference number
            appeal_letter: Appeal letter text
            supporting_documents: Supporting documentation

        Returns:
            Appeal submission response
        """
        pass

    @abstractmethod
    async def request_peer_to_peer(
        self,
        reference_number: str,
        prescriber_availability: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Request a peer-to-peer review.

        Args:
            reference_number: PA reference number
            prescriber_availability: Available times for P2P

        Returns:
            P2P scheduling information
        """
        pass
