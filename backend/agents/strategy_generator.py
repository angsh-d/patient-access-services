"""Strategy generator agent for access pathway optimization."""
from typing import Dict, Any, List, Optional, Tuple

from backend.models.strategy import Strategy, StrategyScore, CounterfactualAnalysis
from backend.models.coverage import CoverageAssessment
from backend.models.case_state import CaseState
from backend.reasoning.strategy_scorer import get_strategy_scorer
from backend.reasoning.llm_gateway import get_llm_gateway
from backend.reasoning.prompt_loader import get_prompt_loader
from backend.models.enums import TaskCategory
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class StrategyGeneratorAgent:
    """
    Agent responsible for generating and scoring access strategies.
    Uses deterministic scoring - no LLM involved.
    """

    def __init__(self):
        """Initialize the strategy generator agent."""
        self.scorer = get_strategy_scorer()
        self.llm_gateway = get_llm_gateway()
        self.prompt_loader = get_prompt_loader()
        logger.info("Strategy generator agent initialized")

    async def generate_strategies(
        self,
        case_state: CaseState
    ) -> List[Strategy]:
        """
        Generate available strategies for a case.

        IMPORTANT: Only generates valid sequential primary-first strategies.
        Parallel and secondary-first approaches are NOT supported.

        Args:
            case_state: Current case state

        Returns:
            List of available strategies (only valid primary-first approaches)
        """
        logger.info("Generating strategies", case_id=case_state.case_id)

        # Convert stored assessments to CoverageAssessment objects
        assessments = self._convert_assessments(case_state.coverage_assessments)

        # Get primary and secondary payer from patient object
        primary_payer = None
        secondary_payer = None
        if hasattr(case_state, 'patient') and case_state.patient:
            primary_payer = getattr(case_state.patient, 'primary_payer', None)
            secondary_payer = getattr(case_state.patient, 'secondary_payer', None)

        # Fallback: try raw patient_data dict if available
        if not primary_payer:
            patient_data = getattr(case_state, 'patient_data', None) or {}
            primary_payer = patient_data.get("insurance", {}).get("primary", {}).get("payer_name")
            secondary_payer = patient_data.get("insurance", {}).get("secondary", {}).get("payer_name")

        # Generate strategies with proper payer ordering (always primary first)
        strategies = self.scorer.generate_strategies(
            assessments,
            primary_payer=primary_payer,
            secondary_payer=secondary_payer
        )

        logger.info(
            "Strategies generated",
            case_id=case_state.case_id,
            count=len(strategies),
            primary_payer=primary_payer,
            secondary_payer=secondary_payer
        )

        return strategies

    async def score_strategies(
        self,
        case_state: CaseState,
        strategies: List[Strategy]
    ) -> List[StrategyScore]:
        """
        Score all strategies for a case.

        Args:
            case_state: Current case state
            strategies: Strategies to score

        Returns:
            Sorted list of strategy scores
        """
        logger.info(
            "Scoring strategies",
            case_id=case_state.case_id,
            count=len(strategies)
        )

        assessments = self._convert_assessments(case_state.coverage_assessments)

        scores = self.scorer.score_all_strategies(
            strategies=strategies,
            case_id=case_state.case_id,
            coverage_assessments=assessments
        )

        return scores

    async def select_best_strategy(
        self,
        case_state: CaseState
    ) -> Tuple[Strategy, List[StrategyScore], str]:
        """
        Select the optimal strategy for a case.

        Args:
            case_state: Current case state

        Returns:
            Tuple of (best_strategy, all_scores, rationale)
        """
        logger.info("Selecting best strategy", case_id=case_state.case_id)

        # Generate strategies
        strategies = await self.generate_strategies(case_state)

        if not strategies:
            raise ValueError("No strategies could be generated")

        # Score and select
        assessments = self._convert_assessments(case_state.coverage_assessments)
        best_strategy, all_scores = self.scorer.select_best_strategy(
            strategies=strategies,
            case_id=case_state.case_id,
            coverage_assessments=assessments
        )

        # Build rationale
        rationale = self._build_selection_rationale(best_strategy, all_scores, assessments)

        logger.info(
            "Strategy selected",
            case_id=case_state.case_id,
            strategy=best_strategy.name,
            score=all_scores[0].total_score
        )

        return best_strategy, all_scores, rationale

    def _convert_assessments(
        self,
        stored_assessments: Dict[str, Any]
    ) -> Dict[str, CoverageAssessment]:
        """Convert stored assessment dicts to CoverageAssessment objects."""
        assessments = {}
        for payer_name, data in stored_assessments.items():
            if isinstance(data, dict):
                assessments[payer_name] = CoverageAssessment(**data)
            elif isinstance(data, CoverageAssessment):
                assessments[payer_name] = data
        return assessments

    def _build_selection_rationale(
        self,
        selected: Strategy,
        all_scores: List[StrategyScore],
        assessments: Dict[str, CoverageAssessment]
    ) -> str:
        """Build human-readable rationale for strategy selection."""
        if not all_scores:
            return "No scoring data available"

        top_score = all_scores[0]
        runner_up = all_scores[1] if len(all_scores) > 1 else None

        rationale_parts = [
            f"Selected '{selected.name}' with score {top_score.total_score:.2f}.",
            "",
            "Key factors:",
            f"- Approval likelihood score: {top_score.approval_score:.1f}/10",
            f"- Speed score: {top_score.speed_score:.1f}/10",
            f"- Low rework score: {top_score.rework_score:.1f}/10",
            f"- Patient convenience score: {top_score.patient_score:.1f}/10",
        ]

        # Add adjustment reasons
        if top_score.adjustment_reasoning:
            rationale_parts.append("")
            rationale_parts.append("Adjustments applied:")
            for reason in top_score.adjustment_reasoning:
                rationale_parts.append(f"- {reason}")

        # Compare to runner-up
        if runner_up:
            score_diff = top_score.total_score - runner_up.total_score
            rationale_parts.append("")
            rationale_parts.append(
                f"Advantage over next best option: +{score_diff:.2f} points"
            )

        # Add payer-specific insights
        rationale_parts.append("")
        rationale_parts.append("Payer analysis:")
        first_payer = selected.payer_sequence[0] if selected.payer_sequence else None
        if first_payer and first_payer in assessments:
            assessment = assessments[first_payer]
            rationale_parts.append(
                f"- {first_payer} approval likelihood: {assessment.approval_likelihood:.0%}"
            )
            rationale_parts.append(
                f"- Criteria met: {assessment.criteria_met_count}/{assessment.criteria_total_count}"
            )
            if assessment.step_therapy_required:
                status = "satisfied" if assessment.step_therapy_satisfied else "NOT satisfied"
                rationale_parts.append(f"- Step therapy: {status}")

        return "\n".join(rationale_parts)

    def get_strategy_comparison(
        self,
        strategies: List[Strategy],
        scores: List[StrategyScore]
    ) -> Dict[str, Any]:
        """
        Generate a comparison of all strategies.

        Args:
            strategies: List of strategies
            scores: List of scores

        Returns:
            Comparison data structure
        """
        # Create lookup
        strategy_lookup = {s.strategy_id: s for s in strategies}

        comparison = {
            "strategies": [],
            "recommended": None,
            "score_range": {
                "min": min(s.total_score for s in scores) if scores else 0,
                "max": max(s.total_score for s in scores) if scores else 0
            }
        }

        for score in scores:
            strategy = strategy_lookup.get(score.strategy_id)
            if strategy:
                entry = {
                    "strategy_id": score.strategy_id,
                    "name": strategy.name,
                    "type": strategy.strategy_type.value,
                    "rank": score.rank,
                    "total_score": score.total_score,
                    "scores": {
                        "speed": score.speed_score,
                        "approval": score.approval_score,
                        "rework": score.rework_score,
                        "patient": score.patient_score
                    },
                    "payer_sequence": strategy.payer_sequence,
                    "parallel": strategy.parallel_submission,
                    "is_recommended": score.is_recommended,
                    "rationale": strategy.rationale,
                    "risk_factors": strategy.risk_factors
                }
                comparison["strategies"].append(entry)

                if score.is_recommended:
                    comparison["recommended"] = entry

        return comparison

    async def generate_counterfactual_analysis(
        self,
        case_state: CaseState,
        selected_strategy: Strategy,
        all_scores: List[StrategyScore],
        strategies: List[Strategy]
    ) -> CounterfactualAnalysis:
        """
        Generate counterfactual analysis explaining what would happen under alternative strategies.

        Uses LLM to provide "what-if" reasoning for decision transparency.

        Args:
            case_state: Current case state
            selected_strategy: The strategy that was selected
            all_scores: All strategy scores
            strategies: All strategy options

        Returns:
            CounterfactualAnalysis with alternatives and tradeoffs
        """
        logger.info(
            "Generating counterfactual analysis",
            case_id=case_state.case_id,
            selected=selected_strategy.name
        )

        # Build strategy lookup
        strategy_lookup = {s.strategy_id: s for s in strategies}
        score_lookup = {s.strategy_id: s for s in all_scores}

        # Get selected strategy score
        selected_score = score_lookup.get(selected_strategy.strategy_id)

        # Build alternative strategies description
        alternatives_text = []
        for score in all_scores:
            if score.strategy_id != selected_strategy.strategy_id:
                strategy = strategy_lookup.get(score.strategy_id)
                if strategy:
                    alt_text = f"""
### {strategy.name} (Score: {score.total_score:.2f})
- Type: {strategy.strategy_type.value}
- Payer Sequence: {' -> '.join(strategy.payer_sequence)}
- Parallel Submission: {'Yes' if strategy.parallel_submission else 'No'}
- Risk Factors: {', '.join(strategy.risk_factors) if strategy.risk_factors else 'None'}
- Rationale: {strategy.rationale}
"""
                    alternatives_text.append(alt_text)

        # Build coverage assessments description
        assessments = self._convert_assessments(case_state.coverage_assessments)
        coverage_text = []
        for payer_name, assessment in assessments.items():
            cov_text = f"""
### {payer_name}
- Approval Likelihood: {assessment.approval_likelihood:.0%}
- Criteria Met: {assessment.criteria_met_count}/{assessment.criteria_total_count}
- Step Therapy Required: {'Yes' if assessment.step_therapy_required else 'No'}
- Step Therapy Satisfied: {'Yes' if assessment.step_therapy_satisfied else 'N/A'}
- Overall Status: {assessment.overall_status.value}
"""
            coverage_text.append(cov_text)

        # Get patient and medication info
        patient_data = case_state.patient_data or {}
        medication_data = case_state.medication_data or {}
        patient_name = patient_data.get("demographics", {}).get("name", "Unknown")
        medication_name = medication_data.get("medication_request", {}).get("medication_name", "Unknown")

        # Load and format prompt
        prompt = self.prompt_loader.load(
            "strategy/counterfactual_analysis.txt",
            {
                "case_id": case_state.case_id,
                "patient_name": patient_name,
                "medication_name": medication_name,
                "selected_strategy": selected_strategy.name,
                "selected_score": f"{selected_score.total_score:.2f}" if selected_score else "N/A",
                "alternative_strategies": "\n".join(alternatives_text) if alternatives_text else "No alternatives",
                "coverage_assessments": "\n".join(coverage_text) if coverage_text else "No assessments"
            }
        )

        # Use Gemini for counterfactual analysis (allows fallback)
        result = await self.llm_gateway.generate(
            task_category=TaskCategory.SUMMARY_GENERATION,
            prompt=prompt,
            temperature=0.3,
            response_format="json"
        )

        # Parse result into CounterfactualAnalysis model
        analysis_data = result.get("counterfactual_analysis", result)

        # Build alternatives list
        alternatives = []
        for alt in analysis_data.get("alternatives", []):
            alternatives.append({
                "strategy_id": alt.get("id", ""),
                "name": alt.get("name", ""),
                "score": alt.get("score", 0.0),
                "projected_days_to_decision": alt.get("projected_days_to_decision", 0),
                "projected_approval_probability": alt.get("projected_approval_probability", 0.0),
                "what_would_happen": alt.get("what_would_happen", ""),
                "key_risks": alt.get("key_risks", []),
                "when_to_prefer": alt.get("when_to_prefer", "")
            })

        counterfactual = CounterfactualAnalysis(
            case_id=case_state.case_id,
            selected_strategy_id=selected_strategy.strategy_id,
            selected_strategy_name=selected_strategy.name,
            alternatives=alternatives,
            key_tradeoffs=analysis_data.get("key_tradeoffs", []),
            selection_rationale=analysis_data.get("selection_rationale", ""),
            sensitivity_factors=analysis_data.get("sensitivity_factors", [])
        )

        logger.info(
            "Counterfactual analysis generated",
            case_id=case_state.case_id,
            alternatives_analyzed=len(alternatives)
        )

        return counterfactual


# Global instance
_strategy_generator: Optional[StrategyGeneratorAgent] = None


def get_strategy_generator() -> StrategyGeneratorAgent:
    """Get or create the global strategy generator agent."""
    global _strategy_generator
    if _strategy_generator is None:
        _strategy_generator = StrategyGeneratorAgent()
    return _strategy_generator
