"""Case management API routes."""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query

from backend.api.requests import CreateCaseRequest, ProcessCaseRequest, ConfirmDecisionRequest
from backend.api.responses import (
    CaseResponse,
    CaseListResponse,
    AuditTrailResponse,
    ErrorResponse
)
from backend.api.dependencies import get_case_service
from backend.services.case_service import CaseService
from backend.models.enums import CaseStage
from backend.mock_services.scenarios import get_scenario_manager, Scenario
from backend.config.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/cases", tags=["Cases"])


@router.post("", response_model=CaseResponse)
async def create_case(
    request: CreateCaseRequest,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Create a new prior authorization case.

    Args:
        request: Case creation request with patient_id
        case_service: Injected case service

    Returns:
        Created case data
    """
    try:
        case_data = await case_service.create_case(request.patient_id)
        return CaseResponse.from_dict(case_data)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error creating case", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("", response_model=CaseListResponse)
async def list_cases(
    stage: Optional[str] = Query(None, description="Filter by stage"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    case_service: CaseService = Depends(get_case_service)
):
    """
    List all cases with optional filtering.

    Args:
        stage: Optional stage filter
        limit: Maximum results
        offset: Pagination offset
        case_service: Injected case service

    Returns:
        List of cases
    """
    try:
        stage_enum = CaseStage(stage) if stage else None
        cases = await case_service.list_cases(stage=stage_enum, limit=limit, offset=offset)
        total = await case_service.count_cases(stage=stage_enum)

        return CaseListResponse(
            cases=[CaseResponse.from_dict(c) for c in cases],
            total=total,
            limit=limit,
            offset=offset
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error listing cases", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(
    case_id: str,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Get a case by ID.

    Args:
        case_id: Case identifier
        case_service: Injected case service

    Returns:
        Case data
    """
    try:
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")
        return CaseResponse.from_dict(case_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting case", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{case_id}/process", response_model=CaseResponse)
async def process_case(
    case_id: str,
    request: Optional[ProcessCaseRequest] = None,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Process a case through the full workflow.

    Args:
        case_id: Case identifier
        request: Optional processing options
        case_service: Injected case service

    Returns:
        Processed case data
    """
    try:
        # Set scenario if specified
        if request and request.scenario:
            scenario_manager = get_scenario_manager()
            try:
                scenario_manager.set_scenario(Scenario(request.scenario))
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid scenario: {request.scenario}"
                )

        case_data = await case_service.process_case(case_id)

        return CaseResponse.from_dict(case_data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Error processing case", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{case_id}/analyze")
async def analyze_case_policies(
    case_id: str,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Run policy analysis for a case.

    Args:
        case_id: Case identifier
        case_service: Injected case service

    Returns:
        Analysis results
    """
    try:
        result = await case_service.analyze_policies(case_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Error analyzing policies", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{case_id}/generate-strategies")
async def generate_case_strategies(
    case_id: str,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Generate and score strategies for a case.

    Args:
        case_id: Case identifier
        case_service: Injected case service

    Returns:
        Strategies and scores
    """
    try:
        result = await case_service.generate_strategies(case_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Error generating strategies", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{case_id}/audit-trail", response_model=AuditTrailResponse)
async def get_case_audit_trail(
    case_id: str,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Get the complete audit trail for a case.

    Args:
        case_id: Case identifier
        case_service: Injected case service

    Returns:
        Audit trail with all decision events
    """
    try:
        trail = await case_service.get_audit_trail(case_id)
        return AuditTrailResponse(
            case_id=trail["case_id"],
            event_count=trail["event_count"],
            events=trail["events"],
            chain_valid=trail["chain_valid"]
        )
    except Exception as e:
        logger.error("Error getting audit trail", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{case_id}/run-stage/{stage}")
async def run_single_stage(
    case_id: str,
    stage: str,
    refresh: bool = Query(False, description="Force fresh LLM call, bypassing cached results"),
    case_service: CaseService = Depends(get_case_service)
):
    """
    Run a single workflow stage and return agent analysis.

    This endpoint supports human-in-the-loop workflow by:
    1. Running only the specified stage
    2. Returning detailed agent reasoning and findings
    3. Requiring explicit approval before proceeding

    Use refresh=true to force a fresh LLM call even if cached results exist.

    Args:
        case_id: Case identifier
        stage: Stage to run (policy_analysis, strategy_generation, etc.)
        refresh: Force fresh analysis (default: false, returns cached if available)
        case_service: Injected case service

    Returns:
        Stage analysis results with agent reasoning
    """
    try:
        result = await case_service.run_stage(case_id, stage, refresh=refresh)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error running stage", case_id=case_id, stage=stage, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{case_id}/approve-stage/{stage}")
async def approve_stage(
    case_id: str,
    stage: str,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Approve a stage and advance to the next stage.

    This is the human-in-the-loop approval gate. The case will not
    progress until this endpoint is called.

    Args:
        case_id: Case identifier
        stage: Stage being approved
        case_service: Injected case service

    Returns:
        Updated case with next stage
    """
    try:
        result = await case_service.approve_stage(case_id, stage)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error approving stage", case_id=case_id, stage=stage, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{case_id}/select-strategy")
async def select_strategy(
    case_id: str,
    strategy_id: str = Query(..., description="Strategy ID to select"),
    case_service: CaseService = Depends(get_case_service)
):
    """
    Select a strategy for the case (human override or approval).

    Args:
        case_id: Case identifier
        strategy_id: Selected strategy ID
        case_service: Injected case service

    Returns:
        Updated case with selected strategy
    """
    try:
        result = await case_service.select_strategy(case_id, strategy_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Error selecting strategy", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{case_id}/confirm-decision")
async def confirm_human_decision(
    case_id: str,
    request: ConfirmDecisionRequest,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Confirm a human decision at the decision gate.

    This is the critical human-in-the-loop checkpoint. The case will NOT
    progress past AWAITING_HUMAN_DECISION without this explicit confirmation.

    Following Anthropic's prior-auth-review-skill pattern:
    - AI recommends APPROVE or PEND only (never auto-DENY)
    - Human must explicitly confirm, reject, or override
    - Complete audit trail of human decisions

    Returns:
        Updated case with decision recorded and stage advanced
    """
    try:
        result = await case_service.confirm_human_decision(
            case_id=case_id,
            action=request.action,
            reviewer_id=request.reviewer_id,
            reviewer_name=request.reviewer_name,
            reason=request.reason,
            notes=request.notes
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(
            "Error confirming human decision",
            case_id=case_id,
            action=request.action,
            error=str(e)
        )
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{case_id}/decision-status")
async def check_decision_status(
    case_id: str,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Check if a case requires human decision.

    Use this endpoint to poll for cases awaiting human review.

    Returns:
        Dict with requires_decision, reason, and current assessment
    """
    try:
        result = await case_service.check_human_decision_required(case_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Error checking decision status", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{case_id}/strategic-intelligence")
async def get_strategic_intelligence(
    case_id: str,
    refresh: bool = Query(False, description="Force cache refresh and regenerate intelligence"),
    case_service: CaseService = Depends(get_case_service)
):
    """
    Get strategic intelligence analysis for a case.

    Results are cached for 24 hours by default. Use refresh=true to force regeneration.

    This endpoint provides AI-powered strategic analysis based on historical
    PA data, including:
    - Similar case analysis with approval rates
    - Documentation gap insights with impact predictions
    - Payer-specific requirements and patterns
    - Timing recommendations
    - Risk factors and mitigation strategies
    - Counterfactual reasoning ("if X then Y" analysis)
    - Prioritized action recommendations with confidence scores

    Args:
        case_id: Case identifier
        refresh: Force cache refresh (default: false)
        case_service: Injected case service

    Returns:
        Strategic intelligence insights with reasoning chain and cache status
    """
    from backend.agents.strategic_intelligence_agent import get_strategic_intelligence_agent
    from backend.agents.intake_agent import get_intake_agent

    try:
        # Get case data
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        # Get patient data for clinical details
        patient_id = case_data.get("patient", {}).get("patient_id")
        if not patient_id:
            raise HTTPException(
                status_code=400,
                detail="Case does not have associated patient data"
            )

        intake_agent = get_intake_agent()
        patient_data = await intake_agent.load_patient_data(patient_id)

        # Generate strategic intelligence (with caching)
        agent = get_strategic_intelligence_agent()
        start_time = datetime.now(timezone.utc)
        insights = await agent.generate_strategic_intelligence(
            case_data=case_data,
            patient_data=patient_data,
            skip_cache=refresh
        )
        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000

        # Determine if result was from cache (fast response indicates cache hit)
        # A fresh generation with LLM call typically takes >500ms
        from_cache = elapsed_ms < 100 and not refresh

        # Log for audit trail
        logger.info(
            "Strategic intelligence retrieved",
            case_id=case_id,
            similar_cases=insights.similar_cases_count,
            confidence=insights.confidence_score,
            from_cache=from_cache,
            elapsed_ms=round(elapsed_ms, 2)
        )

        return {
            "case_id": case_id,
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "cache_status": {
                "from_cache": from_cache,
                "cache_ttl_hours": agent.cache_ttl_hours,
                "refresh_requested": refresh
            },
            **insights.to_dict()
        }

    except FileNotFoundError as e:
        logger.warning("Data not found for strategic intelligence", case_id=case_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Error generating strategic intelligence", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{case_id}/strategic-intelligence/cache")
async def invalidate_strategic_intelligence_cache(
    case_id: str,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Invalidate cached strategic intelligence for a case.

    Use this endpoint when case data has changed significantly and you want
    to ensure the next request generates fresh intelligence.

    Args:
        case_id: Case identifier

    Returns:
        Number of cache entries invalidated
    """
    from backend.agents.strategic_intelligence_agent import get_strategic_intelligence_agent

    try:
        # Verify case exists
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        agent = get_strategic_intelligence_agent()
        deleted_count = await agent.invalidate_cache_for_case(case_id)

        logger.info("Strategic intelligence cache invalidated", case_id=case_id, deleted_count=deleted_count)

        return {
            "case_id": case_id,
            "cache_entries_invalidated": deleted_count,
            "message": f"Successfully invalidated {deleted_count} cache entries"
        }

    except Exception as e:
        logger.error("Error invalidating cache", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{case_id}")
async def delete_case(
    case_id: str,
    case_service: CaseService = Depends(get_case_service)
):
    """
    Delete a case.

    Args:
        case_id: Case identifier
        case_service: Injected case service

    Returns:
        Deletion confirmation
    """
    try:
        deleted = await case_service.delete_case(case_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")
        return {"message": f"Case {case_id} deleted", "case_id": case_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting case", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")
