"""Case state models for tracking prior authorization cases."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from uuid import uuid4

from .enums import CaseStage, PayerStatus, HumanDecisionAction


@dataclass(frozen=False)
class HumanDecision:
    """Record of a human decision at a gate checkpoint."""
    decision_id: str = field(default_factory=lambda: str(uuid4()))
    stage: str = ""
    action: HumanDecisionAction = HumanDecisionAction.APPROVE
    reviewer_id: str = ""
    reviewer_name: Optional[str] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    original_recommendation: Optional[str] = None
    override_reason: Optional[str] = None
    notes: Optional[str] = None


@dataclass(frozen=False)
class PatientInfo:
    """Patient demographic and insurance information."""
    patient_id: str
    first_name: str
    last_name: str
    date_of_birth: str
    primary_payer: str
    primary_member_id: str
    secondary_payer: Optional[str] = None
    secondary_member_id: Optional[str] = None
    diagnosis_codes: List[str] = field(default_factory=list)
    allergies: List[str] = field(default_factory=list)
    contraindications: List[str] = field(default_factory=list)


@dataclass(frozen=False)
class MedicationRequest:
    """Medication being requested for prior authorization."""
    medication_name: str
    generic_name: str
    ndc_code: str
    dose: str
    frequency: str
    route: str
    duration: str
    diagnosis: str
    icd10_code: str
    prescriber_npi: str
    prescriber_name: str
    clinical_rationale: str
    prior_treatments: List[Dict[str, Any]] = field(default_factory=list)
    supporting_labs: List[Dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=False)
class PayerState:
    """State of authorization with a specific payer."""
    payer_name: str
    status: PayerStatus = PayerStatus.NOT_SUBMITTED
    reference_number: Optional[str] = None
    submitted_at: Optional[datetime] = None
    last_updated: Optional[datetime] = None
    response_details: Optional[Dict[str, Any]] = None
    required_documents: List[str] = field(default_factory=list)
    denial_reason: Optional[str] = None
    appeal_deadline: Optional[datetime] = None


@dataclass(frozen=False)
class CaseState:
    """
    Immutable case state with versioning.
    Each state change creates a new version.
    """
    case_id: str = field(default_factory=lambda: str(uuid4()))
    version: int = 1
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # Current stage
    stage: CaseStage = CaseStage.INTAKE

    # Patient and medication
    patient: Optional[PatientInfo] = None
    medication: Optional[MedicationRequest] = None

    # Payer states
    payer_states: Dict[str, PayerState] = field(default_factory=dict)

    # Analysis results
    coverage_assessments: Dict[str, Any] = field(default_factory=dict)
    documentation_gaps: List[Dict[str, Any]] = field(default_factory=list)

    # Strategy
    available_strategies: List[Dict[str, Any]] = field(default_factory=list)
    selected_strategy_id: Optional[str] = None
    strategy_rationale: Optional[str] = None

    # Human decision gates
    human_decisions: List[HumanDecision] = field(default_factory=list)
    requires_human_decision: bool = False
    human_decision_reason: Optional[str] = None

    # Execution tracking
    pending_actions: List[Dict[str, Any]] = field(default_factory=list)
    completed_actions: List[Dict[str, Any]] = field(default_factory=list)

    # Metadata
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def next_version(self) -> "CaseState":
        """Create a new version of the case state."""
        import copy
        new_state = copy.deepcopy(self)
        new_state.version = self.version + 1
        new_state.updated_at = datetime.now(timezone.utc)
        return new_state

    def transition_to(self, new_stage: CaseStage) -> "CaseState":
        """Transition to a new stage."""
        new_state = self.next_version()
        new_state.stage = new_stage
        return new_state

    def get_primary_payer_state(self) -> Optional[PayerState]:
        """Get the state of the primary payer."""
        if self.patient and self.patient.primary_payer:
            return self.payer_states.get(self.patient.primary_payer)
        return None

    def get_secondary_payer_state(self) -> Optional[PayerState]:
        """Get the state of the secondary payer."""
        if self.patient and self.patient.secondary_payer:
            return self.payer_states.get(self.patient.secondary_payer)
        return None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "case_id": self.case_id,
            "version": self.version,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "stage": self.stage.value,
            "patient": self._dataclass_to_dict(self.patient) if self.patient else None,
            "medication": self._dataclass_to_dict(self.medication) if self.medication else None,
            "payer_states": {
                k: self._dataclass_to_dict(v) for k, v in self.payer_states.items()
            },
            "coverage_assessments": self.coverage_assessments,
            "documentation_gaps": self.documentation_gaps,
            "available_strategies": self.available_strategies,
            "selected_strategy_id": self.selected_strategy_id,
            "strategy_rationale": self.strategy_rationale,
            "human_decisions": [self._dataclass_to_dict(hd) for hd in self.human_decisions],
            "requires_human_decision": self.requires_human_decision,
            "human_decision_reason": self.human_decision_reason,
            "pending_actions": self.pending_actions,
            "completed_actions": self.completed_actions,
            "error_message": self.error_message,
            "metadata": self.metadata,
        }

    @staticmethod
    def _dataclass_to_dict(obj: Any) -> Dict[str, Any]:
        """Convert dataclass to dictionary."""
        if obj is None:
            return {}
        result = {}
        for key, value in obj.__dict__.items():
            if isinstance(value, datetime):
                result[key] = value.isoformat()
            elif hasattr(value, "value"):  # Enum
                result[key] = value.value
            else:
                result[key] = value
        return result
