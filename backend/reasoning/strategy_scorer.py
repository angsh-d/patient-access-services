"""Strategy Scorer - Deterministic scoring of access strategies."""
from typing import Dict, List, Optional, Any
from uuid import uuid4

from backend.models.strategy import Strategy, StrategyScore, ScoringWeights, STRATEGY_TEMPLATES
from backend.models.coverage import CoverageAssessment
from backend.models.enums import StrategyType
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class StrategyScorer:
    """
    Deterministic strategy scoring algorithm.
    NO LLM involvement - pure calculation.

    Score = (
        weights.speed * speed_score +
        weights.approval * adjusted_approval +
        weights.low_rework * (10 - rework_risk) +
        weights.patient_burden * (10 - patient_burden)
    )
    """

    def __init__(self, weights: Optional[ScoringWeights] = None):
        """
        Initialize the Strategy Scorer.

        Args:
            weights: Scoring weights (defaults to standard weights)
        """
        self.weights = weights or ScoringWeights()
        if not self.weights.validate():
            raise ValueError("Scoring weights must sum to 1.0")
        logger.info(
            "Strategy Scorer initialized",
            weights={
                "speed": self.weights.speed,
                "approval": self.weights.approval,
                "low_rework": self.weights.low_rework,
                "patient_burden": self.weights.patient_burden
            }
        )

    def generate_strategies(
        self,
        coverage_assessments: Dict[str, CoverageAssessment],
        primary_payer: Optional[str] = None,
        secondary_payer: Optional[str] = None
    ) -> List[Strategy]:
        """
        Generate available strategies based on coverage assessments.

        IMPORTANT: Only generates valid sequential primary-first strategies.
        Parallel submission and secondary-first approaches are NOT supported
        as they violate standard PA submission practices.

        Args:
            coverage_assessments: Map of payer name to coverage assessment
            primary_payer: Name of the primary insurance payer
            secondary_payer: Name of the secondary insurance payer (optional)

        Returns:
            List of available strategies (only valid primary-first approaches)
        """
        strategies = []

        # Determine actual payer names from assessments if not provided
        payer_names = list(coverage_assessments.keys())
        if not primary_payer and payer_names:
            # First payer in assessments is typically primary
            primary_payer = payer_names[0]
        if not secondary_payer and len(payer_names) > 1:
            secondary_payer = payer_names[1]

        # Build actual payer sequence (always primary first)
        payer_sequence = [primary_payer] if primary_payer else []
        if secondary_payer:
            payer_sequence.append(secondary_payer)

        for strategy_type, template in STRATEGY_TEMPLATES.items():
            # Replace placeholder payer names with actual payer names
            actual_payer_sequence = []
            for payer_placeholder in template["payer_sequence"]:
                if payer_placeholder == "PRIMARY" and primary_payer:
                    actual_payer_sequence.append(primary_payer)
                elif payer_placeholder == "SECONDARY" and secondary_payer:
                    actual_payer_sequence.append(secondary_payer)

            # If no valid payer sequence, skip this template
            if not actual_payer_sequence:
                actual_payer_sequence = payer_sequence

            # Generate strategy name with actual payer names
            strategy_name = f"Sequential ({actual_payer_sequence[0]} First)" if actual_payer_sequence else template["name"]

            strategy = Strategy(
                strategy_id=str(uuid4()),
                strategy_type=strategy_type,
                name=strategy_name,
                description=template["description"].replace("primary insurance", actual_payer_sequence[0] if actual_payer_sequence else "primary insurance"),
                payer_sequence=actual_payer_sequence,
                parallel_submission=False,  # NEVER parallel
                base_speed_score=template["base_speed_score"],
                base_approval_score=template["base_approval_score"],
                base_rework_risk=template["base_rework_risk"],
                base_patient_burden=template["base_patient_burden"],
                rationale=template["rationale"],
                risk_factors=template["risk_factors"],
                mitigation_strategies=template["mitigation_strategies"],
                steps=self._generate_steps(strategy_type, actual_payer_sequence)
            )
            strategies.append(strategy)

        logger.info("Generated strategies", count=len(strategies), primary_payer=primary_payer)
        return strategies

    def _generate_steps(self, strategy_type: StrategyType, payer_sequence: List[str]) -> list:
        """Generate steps for a strategy.

        Always generates sequential steps - parallel submission is not supported.
        Steps follow the proper primary-first order for PA submissions.
        """
        from backend.models.strategy import StrategyStep

        steps = []
        step_num = 1

        # Sequential: submit to primary first, then secondary (if exists)
        prev_step = None
        for i, payer in enumerate(payer_sequence):
            is_primary = (i == 0)
            deps = [prev_step] if prev_step else []

            # Submit PA step
            steps.append(StrategyStep(
                step_number=step_num,
                action_type="submit_pa",
                target_payer=payer,
                description=f"Submit PA to {payer} ({'primary' if is_primary else 'secondary'})",
                dependencies=deps,
                estimated_duration_hours=24,
                success_criteria=f"{payer} acknowledges submission"
            ))
            prev_step = step_num
            step_num += 1

            # Monitor step
            steps.append(StrategyStep(
                step_number=step_num,
                action_type="check_status",
                target_payer=payer,
                description=f"Monitor {payer} response and await decision",
                dependencies=[prev_step],
                estimated_duration_hours=72 if is_primary else 48,  # Primary may take longer
                success_criteria=f"{payer} decision received (approval/denial)"
            ))
            prev_step = step_num
            step_num += 1

            # For secondary payer, add COB coordination step
            if not is_primary:
                steps.append(StrategyStep(
                    step_number=step_num,
                    action_type="coordinate_benefits",
                    target_payer=payer,
                    description=f"Coordinate benefits between primary and {payer}",
                    dependencies=[prev_step],
                    estimated_duration_hours=24,
                    success_criteria="Coordination of Benefits (COB) completed"
                ))
                prev_step = step_num
                step_num += 1

        return steps

    def score_strategy(
        self,
        strategy: Strategy,
        case_id: str,
        coverage_assessments: Dict[str, CoverageAssessment]
    ) -> StrategyScore:
        """
        Score a strategy for a specific case.

        This is a DETERMINISTIC calculation - no LLM.

        Args:
            strategy: Strategy to score
            case_id: ID of the case
            coverage_assessments: Coverage assessments for each payer

        Returns:
            Strategy score with breakdown
        """
        adjustments = {}
        adjustment_reasoning = []

        # Start with base scores
        speed_score = strategy.base_speed_score
        approval_score = strategy.base_approval_score
        rework_risk = strategy.base_rework_risk
        patient_burden = strategy.base_patient_burden

        # Adjust approval score based on coverage assessments
        first_payer = strategy.payer_sequence[0] if strategy.payer_sequence else None
        if first_payer and first_payer in coverage_assessments:
            assessment = coverage_assessments[first_payer]

            # Boost approval score if first payer has high likelihood
            likelihood_adjustment = (assessment.approval_likelihood - 0.5) * 4
            approval_score = min(10.0, max(0.0, approval_score + likelihood_adjustment))
            adjustments["first_payer_likelihood"] = likelihood_adjustment
            adjustment_reasoning.append(
                f"Adjusted for {first_payer} approval likelihood: {assessment.approval_likelihood:.2f}"
            )

            # Hard floor: approval_score should never exceed likelihood * 10
            # This prevents a base score of 7.0 staying high when likelihood is 0.15
            likelihood_ceiling = assessment.approval_likelihood * 10.0
            if approval_score > likelihood_ceiling + 1.0:
                old_score = approval_score
                approval_score = likelihood_ceiling + 1.0
                adjustments["likelihood_ceiling"] = approval_score - old_score
                adjustment_reasoning.append(
                    f"Approval score capped to {approval_score:.1f} — "
                    f"cannot exceed likelihood ceiling ({assessment.approval_likelihood:.2f})"
                )

            # Adjust for documentation gaps
            critical_gaps = len(assessment.get_critical_gaps())
            if critical_gaps > 0:
                gap_penalty = critical_gaps * 0.5
                approval_score = max(0.0, approval_score - gap_penalty)
                adjustments["documentation_gaps"] = -gap_penalty
                adjustment_reasoning.append(
                    f"Penalty for {critical_gaps} critical documentation gap(s)"
                )

            # Adjust for step therapy — uses LLM assessment values
            step_therapy_required = assessment.step_therapy_required
            step_therapy_satisfied = assessment.step_therapy_satisfied

            if step_therapy_required and not step_therapy_satisfied:
                approval_score = max(0.0, approval_score - 2.0)
                adjustments["step_therapy"] = -2.0
                adjustment_reasoning.append(
                    "Penalty for unsatisfied step therapy requirement"
                )

        # Note: Parallel submission is no longer supported
        # All strategies follow sequential primary-first approach

        # Calculate component scores for weighting
        rework_score = 10.0 - rework_risk  # Invert: lower risk = higher score
        patient_score = 10.0 - patient_burden  # Invert: lower burden = higher score

        # Calculate weighted total
        total_score = (
            self.weights.speed * speed_score +
            self.weights.approval * approval_score +
            self.weights.low_rework * rework_score +
            self.weights.patient_burden * patient_score
        )

        return StrategyScore(
            strategy_id=strategy.strategy_id,
            case_id=case_id,
            speed_score=speed_score,
            approval_score=approval_score,
            rework_score=rework_score,
            patient_score=patient_score,
            adjustments=adjustments,
            adjustment_reasoning=adjustment_reasoning,
            total_score=round(total_score, 2),
            weights_used={
                "speed": self.weights.speed,
                "approval": self.weights.approval,
                "low_rework": self.weights.low_rework,
                "patient_burden": self.weights.patient_burden
            }
        )

    def score_all_strategies(
        self,
        strategies: List[Strategy],
        case_id: str,
        coverage_assessments: Dict[str, CoverageAssessment]
    ) -> List[StrategyScore]:
        """
        Score all strategies and rank them.

        Args:
            strategies: List of strategies to score
            case_id: ID of the case
            coverage_assessments: Coverage assessments

        Returns:
            List of scores, sorted by total_score descending
        """
        scores = []

        for strategy in strategies:
            score = self.score_strategy(strategy, case_id, coverage_assessments)
            scores.append(score)

        # Sort by total score descending
        scores.sort(key=lambda s: s.total_score, reverse=True)

        # Assign ranks and mark recommendation
        for i, score in enumerate(scores):
            score.rank = i + 1
            score.is_recommended = (i == 0)
            if score.is_recommended:
                score.recommendation_reasoning = (
                    f"Highest total score ({score.total_score:.2f}) based on "
                    f"approval likelihood ({score.approval_score:.1f}), "
                    f"speed ({score.speed_score:.1f}), and risk factors."
                )

        logger.info(
            "Strategies scored",
            case_id=case_id,
            top_strategy=scores[0].strategy_id if scores else None,
            top_score=scores[0].total_score if scores else None
        )

        return scores

    def select_best_strategy(
        self,
        strategies: List[Strategy],
        case_id: str,
        coverage_assessments: Dict[str, CoverageAssessment]
    ) -> tuple:
        """
        Select the best strategy for a case.

        Args:
            strategies: Available strategies
            case_id: Case ID
            coverage_assessments: Coverage assessments

        Returns:
            Tuple of (best_strategy, all_scores)
        """
        scores = self.score_all_strategies(strategies, case_id, coverage_assessments)

        if not scores:
            raise ValueError("No strategies to score")

        # Find the strategy matching the top score
        best_score = scores[0]
        best_strategy = next(
            (s for s in strategies if s.strategy_id == best_score.strategy_id),
            None
        )

        return best_strategy, scores


# Global instance
_strategy_scorer: Optional[StrategyScorer] = None


def get_strategy_scorer() -> StrategyScorer:
    """Get or create the global Strategy Scorer instance."""
    global _strategy_scorer
    if _strategy_scorer is None:
        _strategy_scorer = StrategyScorer()
    return _strategy_scorer
