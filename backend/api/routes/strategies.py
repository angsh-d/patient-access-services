"""Strategy API routes."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from backend.api.requests import ScoreStrategiesRequest, CompareWeightsRequest
from backend.api.responses import StrategyResponse, StrategyComparisonResponse
from backend.api.dependencies import get_strategy_service
from backend.services.strategy_service import StrategyService
from backend.config.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/strategies", tags=["Strategies"])


@router.get("/templates")
async def get_strategy_templates(
    strategy_service: StrategyService = Depends(get_strategy_service)
):
    """
    Get all available strategy templates.

    Returns:
        List of strategy templates with base scores and descriptions
    """
    templates = strategy_service.get_available_templates()
    return {"templates": templates}


@router.post("/score")
async def score_strategies(
    request: ScoreStrategiesRequest,
    strategy_service: StrategyService = Depends(get_strategy_service)
):
    """
    Score strategies for a case with optional custom weights.

    Args:
        request: Scoring request with case_id and optional weights

    Returns:
        Scored strategies with comparison
    """
    try:
        result = await strategy_service.score_strategies_for_case(
            case_id=request.case_id,
            weights=request.weights
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Error scoring strategies", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/compare-weights")
async def compare_weight_scenarios(
    request: CompareWeightsRequest,
    strategy_service: StrategyService = Depends(get_strategy_service)
):
    """
    Compare different weight scenarios for a case.

    Shows how different priority weightings affect strategy selection.

    Args:
        request: Request with case_id

    Returns:
        Comparison of multiple weight scenarios
    """
    try:
        # First get the case assessments
        result = await strategy_service.score_strategies_for_case(request.case_id)

        # Get assessments through the service layer (not direct DB access)
        assessments = await strategy_service.get_case_assessments(request.case_id)
        if not assessments:
            raise ValueError("No coverage assessments found for case")

        comparison = strategy_service.compare_weight_scenarios(
            assessments=assessments,
            case_id=request.case_id
        )
        return comparison

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Error comparing weight scenarios", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/scoring-factors")
async def get_scoring_factors():
    """
    Get information about strategy scoring factors.

    Returns:
        Description of all scoring factors and their weights
    """
    return {
        "factors": [
            {
                "name": "speed",
                "description": "Time to reach a decision",
                "default_weight": 0.30,
                "interpretation": "Higher score = faster pathway to approval"
            },
            {
                "name": "approval",
                "description": "Likelihood of approval based on policy analysis",
                "default_weight": 0.40,
                "interpretation": "Higher score = higher probability of approval"
            },
            {
                "name": "low_rework",
                "description": "Risk of needing to redo work (appeals, resubmissions)",
                "default_weight": 0.20,
                "interpretation": "Higher score = lower risk of rework"
            },
            {
                "name": "patient_burden",
                "description": "Impact on patient (delays, complexity)",
                "default_weight": 0.10,
                "interpretation": "Higher score = lower patient burden"
            }
        ],
        "calculation": "Total Score = (weight_speed * speed_score) + (weight_approval * approval_score) + (weight_rework * rework_score) + (weight_patient * patient_score)",
        "score_range": "0.0 - 10.0",
        "note": "Weights must sum to 1.0"
    }


@router.get("/by-type/{strategy_type}")
async def get_strategy_by_type(
    strategy_type: str,
    strategy_service: StrategyService = Depends(get_strategy_service)
):
    """
    Get details for a specific strategy type.

    Args:
        strategy_type: Strategy type (sequential_cigna_first, parallel, optimized)

    Returns:
        Strategy template details
    """
    templates = strategy_service.get_available_templates()

    for template in templates:
        if template["type"] == strategy_type:
            return template

    raise HTTPException(
        status_code=404,
        detail=f"Strategy type not found: {strategy_type}"
    )
