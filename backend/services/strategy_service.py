"""Strategy service for strategy operations."""
from typing import Dict, Any, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.strategy import Strategy, StrategyScore, ScoringWeights, STRATEGY_TEMPLATES
from backend.models.coverage import CoverageAssessment
from backend.models.enums import StrategyType
from backend.reasoning.strategy_scorer import StrategyScorer
from backend.storage.case_repository import CaseRepository
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class StrategyService:
    """
    Service for strategy operations.
    Provides scoring and comparison functionality.
    """

    def __init__(self, session: Optional[AsyncSession] = None):
        """
        Initialize strategy service.

        Args:
            session: Optional database session
        """
        self.session = session
        self.repository = CaseRepository(session) if session else None
        self.scorer = StrategyScorer()
        logger.info("Strategy service initialized")

    def get_available_templates(self) -> List[Dict[str, Any]]:
        """
        Get all available strategy templates.

        Returns:
            List of strategy template information
        """
        templates = []
        for strategy_type, template in STRATEGY_TEMPLATES.items():
            templates.append({
                "type": strategy_type.value,
                "name": template["name"],
                "description": template["description"],
                "payer_sequence": template["payer_sequence"],
                "parallel": template["parallel_submission"],
                "base_scores": {
                    "speed": template["base_speed_score"],
                    "approval": template["base_approval_score"],
                    "rework_risk": template["base_rework_risk"],
                    "patient_burden": template["base_patient_burden"]
                },
                "rationale": template["rationale"],
                "risk_factors": template["risk_factors"],
                "mitigation_strategies": template["mitigation_strategies"]
            })
        return templates

    async def score_strategies_for_case(
        self,
        case_id: str,
        weights: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        Score all strategies for a specific case.

        Args:
            case_id: Case identifier
            weights: Optional custom weights

        Returns:
            Scoring results
        """
        if not self.repository:
            raise ValueError("Database session required")

        logger.info("Scoring strategies for case", case_id=case_id)

        # Get case
        case = await self.repository.get_by_id(case_id)
        if not case:
            raise ValueError(f"Case not found: {case_id}")

        # Get coverage assessments
        assessment_data = case.coverage_assessments or {}
        assessments = {}
        for payer, data in assessment_data.items():
            assessments[payer] = CoverageAssessment(**data)

        # Use custom weights if provided
        if weights:
            scorer = StrategyScorer(ScoringWeights(**weights))
        else:
            scorer = self.scorer

        # Generate strategies
        strategies = scorer.generate_strategies(assessments)

        # Score all
        scores = scorer.score_all_strategies(strategies, case_id, assessments)

        # Build comparison
        comparison = self._build_comparison(strategies, scores)

        return {
            "case_id": case_id,
            "strategies": [s.model_dump() for s in strategies],
            "scores": [s.model_dump() for s in scores],
            "comparison": comparison,
            "recommended": scores[0].model_dump() if scores else None,
            "weights_used": scores[0].weights_used if scores else {}
        }

    async def get_case_assessments(self, case_id: str) -> Dict[str, Any]:
        """
        Get coverage assessments for a case through the service layer.

        Args:
            case_id: Case identifier

        Returns:
            Coverage assessments dict, or empty dict if not found
        """
        if not self.repository:
            raise ValueError("Database session required")

        case = await self.repository.get_by_id(case_id)
        if not case:
            return {}
        return case.coverage_assessments or {}

    def score_with_custom_weights(
        self,
        assessments: Dict[str, Dict[str, Any]],
        case_id: str,
        weights: Dict[str, float]
    ) -> List[Dict[str, Any]]:
        """
        Score strategies with custom weights.

        Args:
            assessments: Coverage assessments by payer
            case_id: Case identifier
            weights: Custom scoring weights

        Returns:
            List of scores
        """
        # Convert assessments
        coverage_assessments = {}
        for payer, data in assessments.items():
            coverage_assessments[payer] = CoverageAssessment(**data)

        # Create scorer with custom weights
        custom_weights = ScoringWeights(**weights)
        scorer = StrategyScorer(custom_weights)

        # Generate and score
        strategies = scorer.generate_strategies(coverage_assessments)
        scores = scorer.score_all_strategies(strategies, case_id, coverage_assessments)

        return [s.model_dump() for s in scores]

    def compare_weight_scenarios(
        self,
        assessments: Dict[str, Dict[str, Any]],
        case_id: str
    ) -> Dict[str, Any]:
        """
        Compare different weight scenarios.

        Args:
            assessments: Coverage assessments
            case_id: Case identifier

        Returns:
            Comparison of different weight scenarios
        """
        # Define weight scenarios
        scenarios = {
            "balanced": {"speed": 0.30, "approval": 0.40, "low_rework": 0.20, "patient_burden": 0.10},
            "approval_focused": {"speed": 0.20, "approval": 0.55, "low_rework": 0.15, "patient_burden": 0.10},
            "speed_focused": {"speed": 0.50, "approval": 0.30, "low_rework": 0.10, "patient_burden": 0.10},
            "patient_focused": {"speed": 0.25, "approval": 0.35, "low_rework": 0.15, "patient_burden": 0.25}
        }

        results = {}
        for scenario_name, weights in scenarios.items():
            scores = self.score_with_custom_weights(assessments, case_id, weights)
            results[scenario_name] = {
                "weights": weights,
                "top_strategy": scores[0]["strategy_id"] if scores else None,
                "top_score": scores[0]["total_score"] if scores else None,
                "ranking": [
                    {"strategy_id": s["strategy_id"], "score": s["total_score"]}
                    for s in scores
                ]
            }

        return {
            "case_id": case_id,
            "scenarios": results,
            "recommendation": self._recommend_scenario(results)
        }

    def _build_comparison(
        self,
        strategies: List[Strategy],
        scores: List[StrategyScore]
    ) -> Dict[str, Any]:
        """Build detailed comparison of strategies."""
        strategy_lookup = {s.strategy_id: s for s in strategies}

        comparison = []
        for score in scores:
            strategy = strategy_lookup.get(score.strategy_id)
            if strategy:
                comparison.append({
                    "rank": score.rank,
                    "strategy_id": score.strategy_id,
                    "name": strategy.name,
                    "type": strategy.strategy_type.value,
                    "total_score": score.total_score,
                    "component_scores": {
                        "speed": score.speed_score,
                        "approval": score.approval_score,
                        "rework": score.rework_score,
                        "patient": score.patient_score
                    },
                    "adjustments": score.adjustments,
                    "is_recommended": score.is_recommended
                })

        return {
            "strategies": comparison,
            "score_spread": max(s.total_score for s in scores) - min(s.total_score for s in scores) if scores else 0,
            "clear_winner": len(scores) > 1 and (scores[0].total_score - scores[1].total_score) > 0.5
        }

    def _recommend_scenario(self, results: Dict[str, Dict]) -> Dict[str, Any]:
        """Recommend the best weight scenario."""
        # Check if all scenarios agree
        top_strategies = [r["top_strategy"] for r in results.values()]
        if len(set(top_strategies)) == 1:
            return {
                "recommendation": "consistent",
                "message": "All scenarios recommend the same strategy",
                "strategy": top_strategies[0]
            }

        # Find scenario with highest confidence (largest gap to #2)
        # For now, recommend balanced
        return {
            "recommendation": "balanced",
            "message": "Balanced weights provide best overall optimization",
            "strategy": results["balanced"]["top_strategy"]
        }


# Factory function
def get_strategy_service(session: Optional[AsyncSession] = None) -> StrategyService:
    """Get a strategy service instance."""
    return StrategyService(session)
