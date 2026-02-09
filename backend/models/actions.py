"""Action models for tracking system actions and results."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from uuid import uuid4

from pydantic import BaseModel, Field

from .enums import ActionType


class ActionRequest(BaseModel):
    """Request to execute an action."""
    action_id: str = Field(default_factory=lambda: str(uuid4()))
    action_type: ActionType = Field(..., description="Type of action to execute")
    case_id: str = Field(..., description="Case this action belongs to")
    target_payer: Optional[str] = Field(default=None, description="Payer this action targets")

    # Action parameters
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Action-specific parameters")

    # Scheduling
    scheduled_at: Optional[datetime] = Field(default=None, description="When to execute")
    priority: int = Field(default=5, ge=1, le=10, description="Priority (1=highest)")

    # Dependencies
    depends_on: List[str] = Field(default_factory=list, description="Action IDs this depends on")

    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(default="system", description="Who/what created this action")


class ActionResult(BaseModel):
    """Result of an executed action."""
    result_id: str = Field(default_factory=lambda: str(uuid4()))
    action_id: str = Field(..., description="ID of the action executed")
    action_type: ActionType = Field(..., description="Type of action executed")
    case_id: str = Field(..., description="Case this action belongs to")

    # Execution details
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = Field(default=None)
    duration_seconds: Optional[float] = Field(default=None)

    # Outcome
    success: bool = Field(..., description="Whether the action succeeded")
    status_code: Optional[str] = Field(default=None, description="Status code from external system")
    response_data: Dict[str, Any] = Field(default_factory=dict, description="Response from action")

    # For PA submissions
    reference_number: Optional[str] = Field(default=None, description="PA reference number")
    payer_status: Optional[str] = Field(default=None, description="Status returned by payer")

    # Error handling
    error_message: Optional[str] = Field(default=None, description="Error message if failed")
    error_code: Optional[str] = Field(default=None, description="Error code if failed")
    retry_eligible: bool = Field(default=True, description="Whether this can be retried")
    retry_count: int = Field(default=0, description="Number of retries attempted")

    # Next steps
    follow_up_actions: List[str] = Field(
        default_factory=list,
        description="Suggested follow-up action types"
    )
    requires_human_review: bool = Field(
        default=False,
        description="Whether human review is required"
    )

    def mark_completed(self, success: bool, response_data: Optional[Dict[str, Any]] = None):
        """Mark the action as completed."""
        self.completed_at = datetime.now(timezone.utc)
        self.success = success
        if response_data:
            self.response_data = response_data
        if self.started_at:
            self.duration_seconds = (self.completed_at - self.started_at).total_seconds()


@dataclass
class ActionQueue:
    """Queue of pending actions for a case."""
    case_id: str
    pending_actions: List[ActionRequest] = field(default_factory=list)
    in_progress_actions: List[ActionRequest] = field(default_factory=list)
    completed_results: List[ActionResult] = field(default_factory=list)

    def add_action(self, action: ActionRequest) -> None:
        """Add an action to the pending queue."""
        self.pending_actions.append(action)
        # Sort by priority
        self.pending_actions.sort(key=lambda a: a.priority)

    def get_next_action(self) -> Optional[ActionRequest]:
        """Get the next action to execute."""
        # Filter by dependencies
        for action in self.pending_actions:
            deps_met = all(
                any(r.action_id == dep_id and r.success for r in self.completed_results)
                for dep_id in action.depends_on
            )
            if deps_met:
                return action
        return None

    def start_action(self, action_id: str) -> Optional[ActionRequest]:
        """Move an action from pending to in-progress."""
        for i, action in enumerate(self.pending_actions):
            if action.action_id == action_id:
                action = self.pending_actions.pop(i)
                self.in_progress_actions.append(action)
                return action
        return None

    def complete_action(self, result: ActionResult) -> None:
        """Complete an action and record the result."""
        # Remove from in-progress
        self.in_progress_actions = [
            a for a in self.in_progress_actions if a.action_id != result.action_id
        ]
        self.completed_results.append(result)
