"""Request models for API endpoints."""
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class CreateCaseRequest(BaseModel):
    """Request to create a new case."""
    patient_id: str = Field(..., description="Patient identifier")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")


class ProcessCaseRequest(BaseModel):
    """Request to process a case through workflow."""
    scenario: Optional[str] = Field(default="happy_path", description="Demo scenario to use")


class AnalyzePoliciesRequest(BaseModel):
    """Request for policy analysis."""
    patient_info: Dict[str, Any] = Field(..., description="Patient information")
    medication_info: Dict[str, Any] = Field(..., description="Medication details")
    payer_name: str = Field(..., description="Payer to analyze")


class ScoreStrategiesRequest(BaseModel):
    """Request to score strategies with custom weights."""
    case_id: str = Field(..., description="Case identifier")
    weights: Optional[Dict[str, float]] = Field(
        default=None,
        description="Custom scoring weights (speed, approval, low_rework, patient_burden)"
    )


class CompareWeightsRequest(BaseModel):
    """Request to compare different weight scenarios."""
    case_id: str = Field(..., description="Case identifier")


class SetScenarioRequest(BaseModel):
    """Request to set the demo scenario."""
    scenario: str = Field(..., description="Scenario name")


class SubmitDocumentsRequest(BaseModel):
    """Request to submit documents for a case."""
    case_id: str = Field(..., description="Case identifier")
    payer_name: str = Field(..., description="Target payer")
    documents: List[Dict[str, Any]] = Field(..., description="Documents to submit")


class SubmitAppealRequest(BaseModel):
    """Request to submit an appeal."""
    case_id: str = Field(..., description="Case identifier")
    payer_name: str = Field(..., description="Target payer")
    appeal_letter: Optional[str] = Field(default=None, description="Appeal letter content")
    supporting_documents: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Supporting documentation"
    )


class DecisionAction(str, Enum):
    """Valid human decision actions."""
    APPROVE = "approve"
    REJECT = "reject"
    OVERRIDE = "override"
    ESCALATE = "escalate"


class ConfirmDecisionRequest(BaseModel):
    """Request to confirm a human decision at the decision gate."""
    action: DecisionAction = Field(..., description="Decision action: approve, reject, override, escalate")
    reviewer_id: str = Field(..., description="ID of the human reviewer")
    reviewer_name: Optional[str] = Field(default=None, description="Name of the reviewer")
    reason: Optional[str] = Field(default=None, description="Reason for rejection or override")
    notes: Optional[str] = Field(default=None, description="Additional notes")


class UpdatePatientFieldRequest(BaseModel):
    """Request to update a patient data field (for corrections during review)."""
    section: str = Field(
        ...,
        description="Dot-notation path to the field, e.g., 'demographics.first_name'",
        min_length=1,
        max_length=200,
        pattern=r'^[a-zA-Z0-9_.]+$'
    )
    value: str = Field(
        ...,
        description="New value for the field",
        max_length=2000
    )
    reason: Optional[str] = Field(
        default=None,
        description="Reason for correction",
        max_length=500
    )


class RequestP2PRequest(BaseModel):
    """Request for peer-to-peer review."""
    case_id: str = Field(..., description="Case identifier")
    payer_name: str = Field(..., description="Target payer")
    availability: List[Dict[str, Any]] = Field(..., description="Prescriber availability slots")
