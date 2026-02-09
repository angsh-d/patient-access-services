"""Audit trail models for decision tracking."""
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from uuid import uuid4

from pydantic import BaseModel, Field

from .enums import EventType


class DecisionEvent(BaseModel):
    """An immutable record of a decision or action."""
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    case_id: str = Field(..., description="Case this event belongs to")
    event_type: EventType = Field(..., description="Type of event")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # What happened
    decision_made: str = Field(..., description="Description of the decision")
    reasoning: str = Field(..., description="Reasoning behind the decision")

    # Context
    stage: str = Field(..., description="Case stage when this occurred")
    actor: str = Field(default="system", description="Who/what made this decision")

    # Data hashes for reproducibility
    input_data_hash: str = Field(..., description="SHA-256 hash of input data")
    input_data_summary: Dict[str, Any] = Field(
        default_factory=dict,
        description="Summary of input data (not full data)"
    )

    # Alternatives considered
    alternatives: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Other options that were considered"
    )

    # Outcome
    outcome: Optional[str] = Field(default=None, description="Outcome of the decision")

    # Cryptographic signature for immutability
    signature: Optional[str] = Field(default=None, description="Signature for audit integrity")
    previous_event_id: Optional[str] = Field(default=None, description="Previous event in chain")

    def compute_signature(self, previous_signature: Optional[str] = None) -> str:
        """Compute cryptographic signature for this event."""
        data_to_sign = {
            "event_id": self.event_id,
            "case_id": self.case_id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp.isoformat(),
            "decision_made": self.decision_made,
            "reasoning": self.reasoning,
            "input_data_hash": self.input_data_hash,
            "previous_signature": previous_signature or "",
        }
        json_str = json.dumps(data_to_sign, sort_keys=True)
        return hashlib.sha256(json_str.encode()).hexdigest()

    @staticmethod
    def hash_input_data(data: Any) -> str:
        """Create SHA-256 hash of input data."""
        if isinstance(data, dict):
            json_str = json.dumps(data, sort_keys=True, default=str)
        else:
            json_str = str(data)
        return hashlib.sha256(json_str.encode()).hexdigest()


@dataclass
class AuditTrail:
    """Complete audit trail for a case."""
    case_id: str
    events: List[DecisionEvent] = field(default_factory=list)
    last_signature: Optional[str] = None

    def add_event(self, event: DecisionEvent) -> DecisionEvent:
        """Add an event to the trail with chained signature."""
        event.previous_event_id = self.events[-1].event_id if self.events else None
        event.signature = event.compute_signature(self.last_signature)
        self.last_signature = event.signature
        self.events.append(event)
        return event

    def verify_chain(self) -> bool:
        """Verify the integrity of the audit chain."""
        if not self.events:
            return True

        previous_signature = None
        for event in self.events:
            expected_signature = event.compute_signature(previous_signature)
            if event.signature != expected_signature:
                return False
            previous_signature = event.signature
        return True

    def get_events_by_type(self, event_type: EventType) -> List[DecisionEvent]:
        """Get all events of a specific type."""
        return [e for e in self.events if e.event_type == event_type]

    def get_decision_timeline(self) -> List[Dict[str, Any]]:
        """Get a timeline of key decisions."""
        decision_types = {
            EventType.STRATEGY_SELECTED,
            EventType.ACTION_EXECUTED,
            EventType.RECOVERY_INITIATED,
        }
        return [
            {
                "timestamp": e.timestamp.isoformat(),
                "event_type": e.event_type.value,
                "decision": e.decision_made,
                "reasoning": e.reasoning,
            }
            for e in self.events
            if e.event_type in decision_types
        ]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "case_id": self.case_id,
            "event_count": len(self.events),
            "events": [e.model_dump(mode='json') for e in self.events],
            "chain_valid": self.verify_chain(),
        }
