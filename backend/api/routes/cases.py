"""Case management API routes."""
from typing import Optional
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func

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
from backend.storage.models import PredictionOutcomeModel, CaseModel, LLMUsageModel
from backend.storage.database import get_db
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

    For recovery-stage cases, routes to RecoveryAgent.generate_appeal_strategy()
    which uses Claude for clinical appeal reasoning. For all other stages, uses
    the normal StrategyGeneratorAgent.

    Args:
        case_id: Case identifier
        case_service: Injected case service

    Returns:
        Strategies and scores (or appeal_strategy for recovery cases)
    """
    try:
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        case_state = case_data.get("case", case_data)

        if case_state.get("stage") == "recovery":
            from backend.agents.recovery_agent import get_recovery_agent
            recovery_agent = get_recovery_agent()

            payer_states = case_state.get("payer_states", {})
            denied_payer = next(
                (p for p, s in payer_states.items() if s.get("status") == "denied"),
                None,
            )
            if not denied_payer:
                raise HTTPException(
                    status_code=400,
                    detail="No denied payer found for recovery-stage case",
                )
            denial_response = payer_states.get(denied_payer, {})

            appeal_case_state = {
                "case_id": case_id,
                "patient_data": case_state.get("patient", {}),
                "medication_data": {"medication_request": case_state.get("medication", {})},
            }

            appeal_strategy = await recovery_agent.generate_appeal_strategy(
                denial_response=denial_response,
                case_state=appeal_case_state,
                payer_name=denied_payer,
            )

            return {"appeal_strategy": appeal_strategy.model_dump()}

        result = await case_service.generate_strategies(case_id)
        return result
    except HTTPException:
        raise
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


@router.get("/{case_id}/stream-stage/{stage}")
async def stream_stage(
    case_id: str,
    stage: str,
    refresh: bool = Query(False, description="Force fresh LLM call"),
    case_service: CaseService = Depends(get_case_service),
):
    """
    Stream stage processing via Server-Sent Events.

    Provides incremental feedback during long-running LLM calls by streaming
    progress events as the analysis proceeds.

    Events emitted:
    - stage_start: {stage, case_id, timestamp}
    - payer_start: {payer_name, percent}
    - progress: {message, percent}
    - payer_complete: {payer_name, coverage_status, approval_likelihood, criteria_met, criteria_total}
    - stage_complete: {full result object}
    - error: {message}
    - done: signals stream end

    Args:
        case_id: Case identifier
        stage: Stage to run (currently only policy_analysis supports streaming)
        refresh: Force fresh analysis (default: false, returns cached if available)
        case_service: Injected case service
    """
    async def event_stream():
        import json as _json
        from datetime import datetime as _dt, timezone as _tz

        try:
            yield f"data: {_json.dumps({'event': 'stage_start', 'stage': stage, 'case_id': case_id, 'timestamp': _dt.now(_tz.utc).isoformat()})}\n\n"

            if stage == "policy_analysis":
                async for event in case_service.stream_policy_analysis(case_id, refresh=refresh):
                    yield f"data: {_json.dumps(event, default=str)}\n\n"
            else:
                # Non-streaming fallback for other stages
                result = await case_service.run_stage(case_id, stage, refresh=refresh)
                yield f"data: {_json.dumps({'event': 'stage_complete', **result}, default=str)}\n\n"

        except Exception as e:
            logger.error("SSE stream error", case_id=case_id, stage=stage, error=str(e))
            yield f"data: {_json.dumps({'event': 'error', 'message': str(e)})}\n\n"

        yield f"data: {_json.dumps({'event': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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


@router.get("/{case_id}/cohort-analysis")
async def get_cohort_analysis(
    case_id: str,
    refresh: bool = Query(False, description="Force fresh analysis, bypassing cache"),
    case_service: CaseService = Depends(get_case_service),
):
    """
    Get cohort similarity analysis for a case.

    Finds clinically similar historical cases, splits into approved/denied
    cohorts, and uses AI to discover non-obvious differentiating factors
    between outcomes. Results are cached for 24 hours.

    Args:
        case_id: Case identifier
        refresh: Force cache refresh (default: false)

    Returns:
        Cohort analysis with differentiating insights and recommendations
    """
    from backend.agents.strategic_intelligence_agent import get_strategic_intelligence_agent
    from backend.agents.intake_agent import get_intake_agent

    try:
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        patient_id = case_data.get("patient", {}).get("patient_id")
        if not patient_id:
            raise HTTPException(status_code=400, detail="Case does not have associated patient data")

        intake_agent = get_intake_agent()
        patient_data = await intake_agent.load_patient_data(patient_id)

        agent = get_strategic_intelligence_agent()
        start_time = datetime.now(timezone.utc)
        analysis = await agent.generate_cohort_analysis(
            case_data=case_data,
            patient_data=patient_data,
            skip_cache=refresh,
        )
        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        from_cache = analysis.pop("_from_cache", False)

        logger.info(
            "Cohort analysis retrieved",
            case_id=case_id,
            status=analysis.get("status"),
            from_cache=from_cache,
            elapsed_ms=round(elapsed_ms, 2),
        )

        return {
            "case_id": case_id,
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            "cache_status": {
                "from_cache": from_cache,
                "cache_ttl_hours": agent.cache_ttl_hours,
                "refresh_requested": refresh,
            },
            **analysis,
        }

    except FileNotFoundError as e:
        logger.warning("Data not found for cohort analysis", case_id=case_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating cohort analysis", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{case_id}/gap-cohort-analysis")
async def get_gap_cohort_analysis(
    case_id: str,
    case_service: CaseService = Depends(get_case_service),
):
    """
    Get gap-driven cohort analysis for a case.

    Takes each documentation gap from policy analysis and analyzes how that
    gap historically impacts denial rates — broken down by payer, severity,
    and time period.
    """
    from backend.agents.strategic_intelligence_agent import get_strategic_intelligence_agent
    from backend.agents.intake_agent import get_intake_agent

    try:
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        documentation_gaps = case_data.get("documentation_gaps", [])
        if not documentation_gaps:
            return {
                "case_id": case_id,
                "status": "no_gaps",
                "message": "No documentation gaps found on this case. Run policy analysis first.",
                "gap_analyses": [],
                "llm_synthesis": {},
                "filter_metadata": {},
            }

        patient_id = case_data.get("patient", {}).get("patient_id")
        if not patient_id:
            raise HTTPException(status_code=400, detail="Case does not have associated patient data")

        intake_agent = get_intake_agent()
        patient_data = await intake_agent.load_patient_data(patient_id)

        agent = get_strategic_intelligence_agent()
        start_time = datetime.now(timezone.utc)
        analysis = await agent.generate_gap_driven_cohort_analysis(
            case_data=case_data,
            patient_data=patient_data,
            documentation_gaps=documentation_gaps,
        )
        elapsed_ms = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000

        logger.info(
            "Gap cohort analysis retrieved",
            case_id=case_id,
            status=analysis.get("status"),
            gap_count=len(analysis.get("gap_analyses", [])),
            elapsed_ms=round(elapsed_ms, 2),
        )

        return {
            "case_id": case_id,
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
            **analysis,
        }

    except FileNotFoundError as e:
        logger.warning("Data not found for gap cohort analysis", case_id=case_id, error=str(e))
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating gap cohort analysis", case_id=case_id, error=str(e))
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


@router.post("/{case_id}/policy-qa")
async def policy_qa(
    case_id: str,
    body: dict,
    case_service: CaseService = Depends(get_case_service),
):
    """
    Ask the Policy Assistant a question about the current case's policy analysis.

    Uses Claude (policy_qa task category) with full case context to answer
    clinical/policy questions grounded in the actual case data.

    Args:
        case_id: Case identifier
        body: {"question": "user's question"}

    Returns:
        {"answer": "...", "question": "..."}
    """
    question = body.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    try:
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        case_state = case_data.get("case", case_data)
        patient = case_state.get("patient", {})
        medication = case_state.get("medication", {})
        primary_payer = patient.get("primary_payer", "Unknown")

        # Build coverage summary
        coverage_assessments = case_state.get("coverage_assessments", {})
        coverage_lines = []
        for payer_name, assessment in coverage_assessments.items():
            if isinstance(assessment, dict):
                status = assessment.get("coverage_status", "unknown")
                likelihood = assessment.get("approval_likelihood", 0)
                met = assessment.get("criteria_met_count", 0)
                total = assessment.get("criteria_total_count", 0)
                coverage_lines.append(
                    f"{payer_name}: status={status}, approval_likelihood={likelihood}, "
                    f"criteria={met}/{total} met"
                )
                details = assessment.get("criteria_details") or assessment.get("criteria_assessments") or []
                for d in details[:12]:
                    name = d.get("criterion_name", "Unknown")
                    is_met = d.get("is_met")
                    reasoning = d.get("reasoning", "")
                    met_str = "Met" if is_met is True else "Not Met" if is_met is False else "Pending"
                    coverage_lines.append(f"  - {name}: {met_str}. {reasoning}")
        coverage_summary = "\n".join(coverage_lines) if coverage_lines else "No coverage assessment available yet."

        # Build documentation gaps
        gaps = case_state.get("documentation_gaps", [])
        gap_lines = [f"- [{g.get('priority', 'medium')}] {g.get('description', '')}" for g in gaps]
        documentation_gaps = "\n".join(gap_lines) if gap_lines else "No documentation gaps identified."

        # Build cohort summary (from last cohort analysis if available)
        cohort_summary = "Cohort analysis data not included in case state. Refer to the cohort intelligence panel for details."

        # Build policy criteria summary
        policy_criteria = "Refer to the Policy Criteria Details section for full criteria breakdown."

        from backend.reasoning.prompt_loader import get_prompt_loader
        from backend.reasoning.claude_pa_client import ClaudePAClient

        prompt_loader = get_prompt_loader()
        prompt = prompt_loader.load(
            "policy_analysis/policy_qa.txt",
            {
                "patient_name": f"{patient.get('first_name', '')} {patient.get('last_name', '')}",
                "patient_dob": patient.get("date_of_birth", "Unknown"),
                "medication_name": medication.get("medication_name", "Unknown"),
                "medication_dose": medication.get("dose", "Unknown"),
                "medication_frequency": medication.get("frequency", "Unknown"),
                "prescriber_name": medication.get("prescriber_name", "Unknown"),
                "primary_payer": primary_payer,
                "diagnosis_codes": ", ".join(patient.get("diagnosis_codes", [])),
                "coverage_summary": coverage_summary,
                "documentation_gaps": documentation_gaps,
                "cohort_summary": cohort_summary,
                "policy_criteria": policy_criteria,
                "question": question,
            }
        )

        client = ClaudePAClient()
        result = await client.analyze_policy(prompt, response_format="text")
        answer = result.get("response", "I was unable to generate an answer.")

        return {"answer": answer, "question": question, "case_id": case_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error in policy Q&A", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Policy Q&A failed: {str(e)}")


@router.post("/{case_id}/predict-appeal")
async def predict_appeal(
    case_id: str,
    case_service: CaseService = Depends(get_case_service),
):
    """
    Predict appeal success likelihood for a denied case.

    Uses Claude (APPEAL_STRATEGY task category) to analyze the denial context,
    clinical profile strength, historical outcomes, documentation quality, and
    payer reversal patterns to produce a calibrated prediction.

    Args:
        case_id: Case identifier

    Returns:
        Appeal prediction with success rate, key factors, recommended actions,
        and risk assessment
    """
    from backend.reasoning.llm_gateway import get_llm_gateway
    from backend.reasoning.prompt_loader import get_prompt_loader
    from backend.models.enums import TaskCategory

    try:
        # Retrieve case
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        case_state = case_data.get("case", case_data)

        # Extract patient and medication info
        patient = case_state.get("patient", {})
        medication = case_state.get("medication", {})
        medication_name = medication.get("medication_name", "Unknown")

        # Build denial context from coverage assessments and payer states
        coverage_assessments = case_state.get("coverage_assessments", {})
        payer_states = case_state.get("payer_states", {})
        documentation_gaps = case_state.get("documentation_gaps", [])

        denial_context_parts = []
        for payer_name, payer_state in payer_states.items():
            status = payer_state.get("status", "")
            if status in ("denied", "appeal_denied"):
                denial_reason = payer_state.get("denial_reason", "")
                denial_code = payer_state.get("denial_reason_code", "") or payer_state.get("denial_code", "")
                assessment = coverage_assessments.get(payer_name, {})
                denial_context_parts.append({
                    "payer_name": payer_name,
                    "status": status,
                    "denial_reason": denial_reason,
                    "denial_reason_code": denial_code,
                    "coverage_status": assessment.get("coverage_status", "unknown") if isinstance(assessment, dict) else "unknown",
                    "approval_likelihood": assessment.get("approval_likelihood", 0) if isinstance(assessment, dict) else 0,
                    "criteria_met": assessment.get("criteria_met_count", 0) if isinstance(assessment, dict) else 0,
                    "criteria_total": assessment.get("criteria_total_count", 0) if isinstance(assessment, dict) else 0,
                })

        # If no denied payers found, check for recovery stage or low-likelihood assessments
        if not denial_context_parts:
            for payer_name, assessment in coverage_assessments.items():
                if isinstance(assessment, dict):
                    likelihood = assessment.get("approval_likelihood", 0)
                    cov_status = assessment.get("coverage_status", "")
                    if likelihood < 0.5 or cov_status in ("requires_human_review", "not_covered", "pend"):
                        denial_context_parts.append({
                            "payer_name": payer_name,
                            "status": payer_states.get(payer_name, {}).get("status", "under_review"),
                            "denial_reason": f"Low approval likelihood ({likelihood}). Coverage status: {cov_status}",
                            "coverage_status": cov_status,
                            "approval_likelihood": likelihood,
                            "criteria_met": assessment.get("criteria_met_count", 0),
                            "criteria_total": assessment.get("criteria_total_count", 0),
                        })

        if not denial_context_parts:
            raise HTTPException(
                status_code=400,
                detail="No denied payers or low-likelihood assessments found for this case. Appeal prediction requires a denial or at-risk coverage assessment."
            )

        # Build clinical strength summary from patient data
        clinical_profile = patient.get("clinical_profile", {})
        diagnoses = clinical_profile.get("diagnoses", [])
        clinical_strength = {
            "diagnosis_codes": patient.get("diagnosis_codes", []),
            "diagnoses": diagnoses,
            "medication_requested": medication_name,
            "dose": medication.get("dose", "Unknown"),
            "frequency": medication.get("frequency", "Unknown"),
            "prescriber": medication.get("prescriber_name", "Unknown"),
            "documentation_gaps_count": len(documentation_gaps),
            "documentation_gaps": [
                {"description": g.get("description", ""), "priority": g.get("priority", "medium")}
                for g in documentation_gaps
            ],
        }

        # Build historical outcomes context from prediction_outcomes table
        historical_outcomes = []
        try:
            async with get_db() as db:
                stmt = select(PredictionOutcomeModel).where(
                    PredictionOutcomeModel.medication_name == medication_name,
                    PredictionOutcomeModel.actual_outcome.isnot(None),
                ).limit(20)
                result = await db.execute(stmt)
                records = result.scalars().all()
                for rec in records:
                    historical_outcomes.append({
                        "payer_name": rec.payer_name,
                        "predicted_likelihood": rec.predicted_likelihood,
                        "actual_outcome": rec.actual_outcome,
                        "strategy_used": rec.strategy_used,
                        "was_effective": rec.was_strategy_effective,
                    })
        except Exception as hist_err:
            logger.warning("Could not fetch historical outcomes", error=str(hist_err))
            historical_outcomes = [{"note": "No historical outcome data available"}]

        if not historical_outcomes:
            historical_outcomes = [{"note": "No historical outcome data available for this medication"}]

        # Build payer reversal pattern summary
        payer_reversal_patterns = []
        for dc in denial_context_parts:
            pn = dc["payer_name"]
            try:
                async with get_db() as db:
                    total_stmt = select(func.count()).select_from(PredictionOutcomeModel).where(
                        PredictionOutcomeModel.payer_name == pn,
                        PredictionOutcomeModel.actual_outcome.isnot(None),
                    )
                    total_result = await db.execute(total_stmt)
                    total_count = total_result.scalar() or 0

                    approved_stmt = select(func.count()).select_from(PredictionOutcomeModel).where(
                        PredictionOutcomeModel.payer_name == pn,
                        PredictionOutcomeModel.actual_outcome == "approved",
                    )
                    approved_result = await db.execute(approved_stmt)
                    approved_count = approved_result.scalar() or 0

                reversal_rate = (approved_count / total_count) if total_count > 0 else None
                payer_reversal_patterns.append({
                    "payer_name": pn,
                    "total_outcomes_recorded": total_count,
                    "approved_count": approved_count,
                    "reversal_rate": reversal_rate,
                    "note": f"Based on {total_count} recorded outcomes" if total_count > 0 else "No historical data for this payer",
                })
            except Exception:
                payer_reversal_patterns.append({
                    "payer_name": pn,
                    "note": "Could not retrieve payer reversal data",
                })

        # Build available documentation summary
        available_docs = case_state.get("available_documents", [])
        completed_actions = case_state.get("completed_actions", [])
        available_documentation = {
            "documents": available_docs if available_docs else ["No explicit document list available"],
            "completed_actions": [
                a.get("action", str(a)) if isinstance(a, dict) else str(a)
                for a in completed_actions[:10]
            ],
            "coverage_criteria_details": {},
        }
        for payer_name, assessment in coverage_assessments.items():
            if isinstance(assessment, dict):
                criteria = assessment.get("criteria_details") or assessment.get("criteria_assessments", [])
                available_documentation["coverage_criteria_details"][payer_name] = criteria[:15] if isinstance(criteria, list) else criteria

        # Load prompt and call LLM
        import json as _json

        prompt_loader = get_prompt_loader()
        prompt = prompt_loader.load(
            "appeals/appeal_prediction.txt",
            {
                "denial_context": _json.dumps(denial_context_parts, indent=2, default=str),
                "patient_profile": _json.dumps(patient, indent=2, default=str),
                "clinical_strength": _json.dumps(clinical_strength, indent=2, default=str),
                "historical_outcomes": _json.dumps(historical_outcomes, indent=2, default=str),
                "available_documentation": _json.dumps(available_documentation, indent=2, default=str),
                "payer_reversal_patterns": _json.dumps(payer_reversal_patterns, indent=2, default=str),
            }
        )

        gateway = get_llm_gateway()
        result = await gateway.generate(
            task_category=TaskCategory.APPEAL_STRATEGY,
            prompt=prompt,
            temperature=0.1,
            response_format="json",
        )

        # Extract the parsed JSON response
        prediction = {
            "case_id": case_id,
            "predicted_success_rate": result.get("predicted_success_rate", 0.5),
            "confidence": result.get("confidence", 0.5),
            "key_factors_for": result.get("key_factors_for", []),
            "key_factors_against": result.get("key_factors_against", []),
            "recommended_actions": result.get("recommended_actions", []),
            "risk_assessment": result.get("risk_assessment", {}),
            "reasoning_chain": result.get("reasoning_chain", ""),
            "denial_context": denial_context_parts,
            "provider": result.get("provider", "unknown"),
        }

        logger.info(
            "Appeal prediction generated",
            case_id=case_id,
            predicted_success_rate=prediction["predicted_success_rate"],
            confidence=prediction["confidence"],
        )

        return prediction

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating appeal prediction", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Appeal prediction failed: {str(e)}")


class DraftAppealLetterRequest(BaseModel):
    """Optional request body for draft-appeal-letter with pre-generated strategy."""
    appeal_strategy: Optional[dict] = Field(default=None, description="Pre-generated appeal strategy from RecoveryAgent")


@router.post("/{case_id}/draft-appeal-letter")
async def draft_appeal_letter(
    case_id: str,
    body: Optional[DraftAppealLetterRequest] = None,
    case_service: CaseService = Depends(get_case_service),
):
    """
    Draft a formal appeal letter using LLM (Gemini via APPEAL_DRAFTING task).

    Builds rich appeal context from the case's denial information, patient
    clinical profile, coverage assessment criteria, and any previously
    generated appeal strategy, then calls the LLM gateway to produce a
    professional, evidence-based letter.

    Args:
        case_id: Case identifier
        body: Optional pre-generated appeal strategy data

    Returns:
        {"letter": "...", "case_id": "..."}
    """
    from backend.reasoning.llm_gateway import get_llm_gateway
    import json as _json

    try:
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        case_state = case_data.get("case", case_data)
        patient = case_state.get("patient", {})
        medication = case_state.get("medication", {})
        coverage_assessments = case_state.get("coverage_assessments", {})
        payer_states = case_state.get("payer_states", {})

        # Build denial details from payer states
        denial_parts = []
        for payer_name, ps in payer_states.items():
            status = ps.get("status", "")
            if status in ("denied", "appeal_denied"):
                denial_parts.append({
                    "payer_name": payer_name,
                    "denial_reason": ps.get("denial_reason", ""),
                    "denial_reason_code": ps.get("denial_reason_code", "") or ps.get("denial_code", ""),
                    "denial_date": ps.get("denial_date", ""),
                })

        # Also include low-likelihood assessments as potential appeal targets
        if not denial_parts:
            for payer_name, assessment in coverage_assessments.items():
                if isinstance(assessment, dict):
                    likelihood = assessment.get("approval_likelihood", 0)
                    cov_status = assessment.get("coverage_status", "")
                    if likelihood < 0.5 or cov_status in ("requires_human_review", "not_covered", "pend"):
                        denial_parts.append({
                            "payer_name": payer_name,
                            "denial_reason": f"Coverage status: {cov_status}, likelihood: {likelihood}",
                        })

        if not denial_parts:
            raise HTTPException(
                status_code=400,
                detail="No denied payers or at-risk assessments found. Appeal letter requires a denial context.",
            )

        # Build clinical evidence from coverage criteria
        clinical_evidence_lines = []
        for payer_name, assessment in coverage_assessments.items():
            if isinstance(assessment, dict):
                criteria = assessment.get("criteria_details") or assessment.get("criteria_assessments", [])
                for c in (criteria if isinstance(criteria, list) else []):
                    name = c.get("criterion_name", "")
                    is_met = c.get("is_met")
                    reasoning = c.get("reasoning", "")
                    status_str = "Met" if is_met else "Not Met" if is_met is False else "Pending"
                    clinical_evidence_lines.append(f"[{payer_name}] {name}: {status_str} — {reasoning}")

        # Build appeal strategy summary from frontend-provided strategy or case state
        appeal_strategy_summary = ""
        strategy_data = body.appeal_strategy if body and body.appeal_strategy else None

        if strategy_data:
            # Use the pre-generated appeal strategy from RecoveryAgent
            parts = []
            primary = strategy_data.get("primary_clinical_argument", "")
            if primary:
                parts.append(f"Primary Clinical Argument:\n{primary}")

            supporting = strategy_data.get("supporting_arguments", [])
            if supporting:
                args_text = "\n".join(f"  {i+1}. {a}" for i, a in enumerate(supporting))
                parts.append(f"Supporting Arguments:\n{args_text}")

            evidence = strategy_data.get("evidence_to_cite", [])
            if evidence:
                ev_lines = []
                for ev in evidence:
                    if isinstance(ev, dict):
                        ev_lines.append(f"  - {ev.get('description', '') or ev.get('title', '') or str(ev)}")
                    elif isinstance(ev, str):
                        ev_lines.append(f"  - {ev}")
                parts.append(f"Evidence to Cite:\n" + "\n".join(ev_lines))

            policy_refs = strategy_data.get("policy_sections_to_reference", [])
            if policy_refs:
                parts.append(f"Policy Sections to Reference:\n" + "\n".join(f"  - {r}" for r in policy_refs))

            appeal_type = strategy_data.get("recommended_appeal_type", "")
            if appeal_type:
                parts.append(f"Recommended Appeal Type: {appeal_type}")

            classification = strategy_data.get("denial_classification", "")
            if classification:
                parts.append(f"Denial Classification: {classification.replace('_', ' ')}")

            fallbacks = strategy_data.get("fallback_strategies", [])
            if fallbacks:
                parts.append(f"Fallback Strategies:\n" + "\n".join(f"  - {f}" for f in fallbacks))

            appeal_strategy_summary = "\n\n".join(parts)
        else:
            # Fall back to case state strategies
            strategies = case_state.get("available_strategies", [])
            if strategies:
                for s in strategies:
                    if isinstance(s, dict):
                        appeal_strategy_summary += f"- {s.get('name', '')}: {s.get('description', '')}\n"

        # Build appeal context dict for prompt substitution
        appeal_context = {
            "appeal_context": _json.dumps({
                "case_id": case_id,
                "patient_name": f"{patient.get('first_name', '')} {patient.get('last_name', '')}",
                "member_id": patient.get("member_id", "[MEMBER ID]"),
                "medication_name": medication.get("medication_name", "Unknown"),
                "dose": medication.get("dose", "Unknown"),
                "frequency": medication.get("frequency", "Unknown"),
                "prescriber_name": medication.get("prescriber_name", "[PRESCRIBER NAME]"),
                "primary_payer": patient.get("primary_payer", "Unknown"),
            }, indent=2, default=str),
            "denial_details": _json.dumps(denial_parts, indent=2, default=str),
            "patient_info": _json.dumps(patient, indent=2, default=str),
            "clinical_evidence": "\n".join(clinical_evidence_lines) if clinical_evidence_lines else "Clinical evidence details are available in the case record.",
            "appeal_strategy": appeal_strategy_summary or "No pre-generated appeal strategy available. Draft based on clinical evidence.",
        }

        gateway = get_llm_gateway()
        letter = await gateway.draft_appeal_letter(appeal_context)

        return {"letter": letter, "case_id": case_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error drafting appeal letter", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Appeal letter drafting failed: {str(e)}")


# --- Request/Response models for prediction outcome tracking ---

class RecordOutcomeRequest(BaseModel):
    """Request body for recording an actual payer outcome."""
    actual_outcome: str = Field(
        ...,
        description="Actual payer decision: approved, denied, info_requested, or withdrawn",
        pattern=r"^(approved|denied|info_requested|withdrawn)$",
    )
    actual_decision_date: Optional[str] = Field(
        default=None,
        description="ISO 8601 date string of the actual decision (e.g. 2026-02-11T00:00:00Z)",
    )
    strategy_used: Optional[str] = Field(default=None, description="Name/ID of the strategy that was used")
    was_strategy_effective: Optional[bool] = Field(default=None, description="Whether the strategy achieved its goal")
    payer_name: str = Field(..., description="Payer whose outcome is being recorded")


@router.post("/{case_id}/record-outcome")
async def record_outcome(
    case_id: str,
    request: RecordOutcomeRequest,
    case_service: CaseService = Depends(get_case_service),
):
    """
    Record the actual payer outcome for a case and create a PredictionOutcome record.

    Looks up the case's coverage_assessments for the given payer to capture
    the AI's predicted_likelihood and predicted_status at time of assessment,
    then stores the actual outcome alongside those predictions.

    Args:
        case_id: Case identifier
        request: Outcome details including payer_name, actual_outcome, etc.

    Returns:
        The created PredictionOutcomeModel record as a dict
    """
    try:
        # Retrieve case
        case_data = await case_service.get_case(case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")

        case_state = case_data.get("case", case_data)

        # Extract predicted values from coverage_assessments for the given payer
        coverage_assessments = case_state.get("coverage_assessments", {})
        payer_assessment = coverage_assessments.get(request.payer_name)
        if not payer_assessment or not isinstance(payer_assessment, dict):
            raise HTTPException(
                status_code=404,
                detail=f"No coverage assessment found for payer '{request.payer_name}' on case {case_id}",
            )

        predicted_likelihood = payer_assessment.get("approval_likelihood", 0.0)
        predicted_status = payer_assessment.get("coverage_status", "unknown")

        # Extract medication name from case
        medication = case_state.get("medication", {})
        medication_name = medication.get("medication_name", "Unknown")

        # Parse actual_decision_date if provided
        actual_decision_date = None
        if request.actual_decision_date:
            try:
                actual_decision_date = datetime.fromisoformat(request.actual_decision_date.replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid date format: {request.actual_decision_date}. Use ISO 8601.",
                )

        # Create the prediction outcome record
        record = PredictionOutcomeModel(
            id=str(uuid4()),
            case_id=case_id,
            predicted_likelihood=predicted_likelihood,
            predicted_status=predicted_status,
            payer_name=request.payer_name,
            medication_name=medication_name,
            actual_outcome=request.actual_outcome,
            actual_decision_date=actual_decision_date,
            strategy_used=request.strategy_used,
            was_strategy_effective=request.was_strategy_effective,
        )

        async with get_db() as db:
            db.add(record)
            await db.flush()
            result = record.to_dict()

        logger.info(
            "Prediction outcome recorded",
            case_id=case_id,
            payer_name=request.payer_name,
            predicted_likelihood=predicted_likelihood,
            actual_outcome=request.actual_outcome,
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error recording prediction outcome", case_id=case_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


# --- Analytics router (separate prefix: /analytics) ---

analytics_router = APIRouter(prefix="/analytics", tags=["Analytics"])


@analytics_router.get("/prediction-accuracy")
async def get_prediction_accuracy():
    """
    Compute prediction accuracy statistics across all recorded outcomes.

    Queries all PredictionOutcomeModel records that have an actual_outcome,
    and computes:
    - total_predictions: number of records with actual outcomes
    - correct_predictions: predicted approved (likelihood >= 50) and actual approved,
      OR predicted not-approved (likelihood < 50) and actual denied
    - accuracy_rate: correct / total (0.0 if no records)
    - average_likelihood_error: mean of abs(predicted_likelihood/100 - actual_binary)
      where actual_binary is 1.0 for approved, 0.0 otherwise

    Returns:
        Summary statistics dict
    """
    try:
        async with get_db() as db:
            stmt = select(PredictionOutcomeModel).where(
                PredictionOutcomeModel.actual_outcome.isnot(None)
            )
            result = await db.execute(stmt)
            records = result.scalars().all()

        total = len(records)
        if total == 0:
            return {
                "total_predictions": 0,
                "correct_predictions": 0,
                "accuracy_rate": 0.0,
                "average_likelihood_error": 0.0,
                "message": "No prediction outcomes recorded yet.",
            }

        correct = 0
        total_error = 0.0

        for rec in records:
            predicted_approved = rec.predicted_likelihood >= 0.50
            actual_approved = rec.actual_outcome == "approved"

            # Correct if both agree on approved or both agree on not-approved
            if predicted_approved == actual_approved:
                correct += 1

            # Likelihood error: distance between predicted probability and actual binary
            actual_binary = 1.0 if actual_approved else 0.0
            total_error += abs(rec.predicted_likelihood - actual_binary)

        accuracy_rate = correct / total
        avg_error = total_error / total

        return {
            "total_predictions": total,
            "correct_predictions": correct,
            "accuracy_rate": round(accuracy_rate, 4),
            "average_likelihood_error": round(avg_error, 4),
        }

    except Exception as e:
        logger.error("Error computing prediction accuracy", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@analytics_router.get("/llm-costs")
async def get_llm_costs(
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    group_by: str = Query("provider", description="Group costs by: provider, model, task_category, case_id"),
):
    """
    Get LLM cost analytics with breakdowns.

    Queries LLMUsageModel records and aggregates costs by the requested dimension.

    Args:
        days: Number of days to look back (default: 30)
        group_by: Grouping dimension (provider, model, task_category, case_id)

    Returns:
        Aggregated cost breakdown with totals
    """
    valid_groups = {"provider", "model", "task_category", "case_id"}
    if group_by not in valid_groups:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid group_by value. Must be one of: {', '.join(valid_groups)}",
        )

    try:
        cutoff = datetime.now(timezone.utc) - __import__("datetime").timedelta(days=days)
        group_col = getattr(LLMUsageModel, group_by)

        async with get_db() as db:
            # Aggregated breakdown
            stmt = (
                select(
                    group_col.label("group_key"),
                    func.count().label("call_count"),
                    func.sum(LLMUsageModel.input_tokens).label("total_input_tokens"),
                    func.sum(LLMUsageModel.output_tokens).label("total_output_tokens"),
                    func.sum(LLMUsageModel.cost_usd).label("total_cost_usd"),
                    func.avg(LLMUsageModel.latency_ms).label("avg_latency_ms"),
                )
                .where(LLMUsageModel.created_at >= cutoff)
                .group_by(group_col)
                .order_by(func.sum(LLMUsageModel.cost_usd).desc())
            )
            result = await db.execute(stmt)
            rows = result.all()

            # Grand totals
            totals_stmt = (
                select(
                    func.count().label("call_count"),
                    func.sum(LLMUsageModel.input_tokens).label("total_input_tokens"),
                    func.sum(LLMUsageModel.output_tokens).label("total_output_tokens"),
                    func.sum(LLMUsageModel.cost_usd).label("total_cost_usd"),
                    func.avg(LLMUsageModel.latency_ms).label("avg_latency_ms"),
                )
                .where(LLMUsageModel.created_at >= cutoff)
            )
            totals_result = await db.execute(totals_stmt)
            totals = totals_result.one()

        breakdown = [
            {
                group_by: row.group_key or "unknown",
                "call_count": row.call_count,
                "total_input_tokens": row.total_input_tokens or 0,
                "total_output_tokens": row.total_output_tokens or 0,
                "total_cost_usd": round(row.total_cost_usd or 0, 6),
                "avg_latency_ms": round(row.avg_latency_ms or 0, 2),
            }
            for row in rows
        ]

        return {
            "period_days": days,
            "group_by": group_by,
            "totals": {
                "call_count": totals.call_count or 0,
                "total_input_tokens": totals.total_input_tokens or 0,
                "total_output_tokens": totals.total_output_tokens or 0,
                "total_cost_usd": round(totals.total_cost_usd or 0, 6),
                "avg_latency_ms": round(totals.avg_latency_ms or 0, 2),
            },
            "breakdown": breakdown,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error computing LLM costs", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")
