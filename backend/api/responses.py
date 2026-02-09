"""Response models for API endpoints."""
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class CaseResponse(BaseModel):
    """Response containing case data."""
    case_id: str
    version: int
    stage: str
    created_at: str
    updated_at: str
    patient: Optional[Dict[str, Any]] = None
    medication: Optional[Dict[str, Any]] = None
    payer_states: Dict[str, Any] = Field(default_factory=dict)
    selected_strategy_id: Optional[str] = None
    strategy_rationale: Optional[str] = None
    error_message: Optional[str] = None
    # HITL workflow data
    coverage_assessments: Optional[Dict[str, Any]] = None
    available_strategies: Optional[List[Dict[str, Any]]] = None
    documentation_gaps: Optional[List[Dict[str, Any]]] = None
    # Human decision gate fields (Anthropic skill pattern)
    requires_human_decision: Optional[bool] = None
    human_decision_reason: Optional[str] = None
    human_decisions: Optional[List[Dict[str, Any]]] = None
    # Metadata from intake
    metadata: Optional[Dict[str, Any]] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CaseResponse":
        """
        Factory method to construct CaseResponse from a case data dict.
        Eliminates repeated 15-field manual mapping across API routes.
        """
        return cls(
            case_id=data["case_id"],
            version=data["version"],
            stage=data["stage"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            patient=data.get("patient"),
            medication=data.get("medication"),
            payer_states=data.get("payer_states", {}),
            selected_strategy_id=data.get("selected_strategy_id"),
            strategy_rationale=data.get("strategy_rationale"),
            error_message=data.get("error_message"),
            coverage_assessments=data.get("coverage_assessments"),
            available_strategies=data.get("available_strategies"),
            documentation_gaps=data.get("documentation_gaps"),
            requires_human_decision=data.get("requires_human_decision"),
            human_decision_reason=data.get("human_decision_reason"),
            human_decisions=data.get("human_decisions"),
            metadata=data.get("metadata"),
        )


class CaseListResponse(BaseModel):
    """Response containing list of cases."""
    cases: List[CaseResponse]
    total: int
    limit: int
    offset: int


class PolicyAnalysisResponse(BaseModel):
    """Response from policy analysis."""
    payer_name: str
    coverage_status: str
    approval_likelihood: float
    criteria_met: int
    criteria_total: int
    documentation_gaps: List[Dict[str, Any]]
    recommendations: List[str]
    step_therapy_required: bool
    step_therapy_satisfied: bool


class StrategyResponse(BaseModel):
    """Response containing strategy data."""
    strategy_id: str
    strategy_type: str
    name: str
    description: str
    payer_sequence: List[str]
    parallel_submission: bool
    base_speed_score: float
    base_approval_score: float
    rationale: str
    risk_factors: List[str]


class StrategyScoreResponse(BaseModel):
    """Response containing strategy score."""
    strategy_id: str
    case_id: str
    rank: int
    total_score: float
    speed_score: float
    approval_score: float
    rework_score: float
    patient_score: float
    adjustments: Dict[str, float]
    is_recommended: bool
    recommendation_reasoning: Optional[str] = None


class StrategyComparisonResponse(BaseModel):
    """Response comparing multiple strategies."""
    case_id: str
    strategies: List[Dict[str, Any]]
    scores: List[StrategyScoreResponse]
    recommended: Optional[StrategyScoreResponse] = None
    comparison: Dict[str, Any]


class AuditEventResponse(BaseModel):
    """Response containing audit event."""
    event_id: str
    case_id: str
    event_type: str
    timestamp: str
    decision_made: str
    reasoning: str
    stage: str
    actor: str


class AuditTrailResponse(BaseModel):
    """Response containing full audit trail."""
    case_id: str
    event_count: int
    events: List[AuditEventResponse]
    chain_valid: bool


class ScenarioResponse(BaseModel):
    """Response containing scenario information."""
    id: str
    name: str
    description: str
    expected_outcome: str
    demo_highlights: List[str]
    is_current: bool = False


class ScenarioListResponse(BaseModel):
    """Response listing available scenarios."""
    scenarios: List[ScenarioResponse]
    current_scenario: str


class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: str
    timestamp: str
    version: str
    components: Dict[str, bool]


class ErrorResponse(BaseModel):
    """Error response."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


class ProcessingEventResponse(BaseModel):
    """WebSocket event for case processing updates."""
    event_type: str
    case_id: str
    timestamp: str
    stage: Optional[str] = None
    previous_stage: Optional[str] = None
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class AIActivityItem(BaseModel):
    """AI activity item for dashboard display."""
    id: str
    agent_type: str
    action: str
    detail: Optional[str] = None
    confidence: Optional[float] = None
    timestamp: str
    case_id: str
    patient_name: Optional[str] = None
    status: str = "success"  # success, in_progress, error
    reasoning: Optional[str] = None


class AIActivityResponse(BaseModel):
    """Response containing AI activity feed."""
    activities: List[AIActivityItem]
    total: int


class StrategicIntelligenceResponse(BaseModel):
    """Response containing strategic intelligence analysis."""
    case_id: str
    generated_at: str
    similar_cases_count: int
    approval_rate_for_similar: float
    documentation_insights: List[Dict[str, Any]]
    payer_insights: List[Dict[str, Any]]
    timing_recommendations: List[Dict[str, Any]]
    risk_factors: List[Dict[str, Any]]
    recommended_actions: List[Dict[str, Any]]
    counterfactual_scenarios: List[Dict[str, Any]]
    reasoning_chain: List[str]
    confidence_score: float
    sample_size_note: str
