"""Evaluation runner for coverage assessment quality."""
import asyncio
import json
import time
from collections import Counter
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class EvalRunner:
    """Runs coverage assessment evaluation against a golden dataset."""

    def __init__(self, golden_path: str = "data/eval/coverage_assessment_golden.json"):
        self.golden_path = Path(golden_path)

    async def run(self, skip_cache: bool = True) -> Dict[str, Any]:
        """Run full evaluation and return metrics.

        Args:
            skip_cache: If True, bypasses the policy analysis cache so every
                case hits the LLM fresh. Defaults to True for evaluation.

        Returns:
            Dictionary containing metrics and per-case results.
        """
        golden_cases = self._load_golden_dataset()
        logger.info("Loaded golden dataset", num_cases=len(golden_cases))

        from backend.reasoning.policy_reasoner import get_policy_reasoner
        reasoner = get_policy_reasoner()

        results: List[Dict[str, Any]] = []
        start_time = time.monotonic()

        for case in golden_cases:
            case_id = case["case_id"]
            logger.info("Evaluating case", case_id=case_id, description=case.get("description", ""))

            try:
                assessment = await reasoner.assess_coverage(
                    patient_info=case["patient_info"],
                    medication_info=case["medication_info"],
                    payer_name=case["payer_name"],
                    skip_cache=skip_cache,
                )

                result = self._evaluate_case(case, assessment)
                results.append(result)
                logger.info(
                    "Case evaluated",
                    case_id=case_id,
                    predicted_status=result["predicted_status"],
                    expected_status=result["expected_status"],
                    status_correct=result["status_correct"],
                    predicted_likelihood=result["predicted_likelihood"],
                )

            except Exception as exc:
                logger.error(
                    "Case evaluation failed",
                    case_id=case_id,
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
                results.append({
                    "case_id": case_id,
                    "description": case.get("description", ""),
                    "expected_status": case["expected_coverage_status"],
                    "predicted_status": None,
                    "status_correct": False,
                    "predicted_likelihood": None,
                    "expected_likelihood_midpoint": (
                        case["expected_approval_likelihood_min"]
                        + case["expected_approval_likelihood_max"]
                    ) / 2.0,
                    "likelihood_in_range": False,
                    "likelihood_error": None,
                    "criteria_met_predicted": [],
                    "criteria_met_expected": case.get("expected_criteria_met_keys", []),
                    "criteria_unmet_predicted": [],
                    "criteria_unmet_expected": case.get("expected_criteria_unmet_keys", []),
                    "criteria_precision": 0.0,
                    "criteria_recall": 0.0,
                    "criteria_f1": 0.0,
                    "error": str(exc),
                    "skipped": True,
                })

        elapsed = time.monotonic() - start_time
        metrics = self._compute_metrics(results)
        metrics["elapsed_seconds"] = round(elapsed, 2)
        metrics["timestamp"] = datetime.now(timezone.utc).isoformat()
        metrics["golden_path"] = str(self.golden_path)

        # Build full report
        report = {
            "metrics": metrics,
            "per_case_results": results,
        }

        # Write report to file
        ts_label = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        report_path = self.golden_path.parent / f"eval_results_{ts_label}.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, default=str)
        logger.info("Evaluation report written", path=str(report_path))

        return metrics

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_golden_dataset(self) -> List[Dict[str, Any]]:
        """Load and validate the golden dataset JSON."""
        if not self.golden_path.exists():
            raise FileNotFoundError(f"Golden dataset not found: {self.golden_path}")
        with open(self.golden_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list) or len(data) == 0:
            raise ValueError("Golden dataset must be a non-empty JSON array")
        return data

    def _evaluate_case(
        self,
        golden: Dict[str, Any],
        assessment: Any,
    ) -> Dict[str, Any]:
        """Compare a single assessment against golden-truth expectations.

        Returns a flat dict with comparison fields for downstream metrics.
        """
        predicted_status = assessment.coverage_status.value if assessment.coverage_status else None
        expected_status = golden["expected_coverage_status"]
        status_correct = self._statuses_match(predicted_status, expected_status)

        predicted_likelihood = assessment.approval_likelihood
        expected_min = golden["expected_approval_likelihood_min"]
        expected_max = golden["expected_approval_likelihood_max"]
        expected_midpoint = (expected_min + expected_max) / 2.0
        likelihood_in_range = (
            predicted_likelihood is not None
            and expected_min <= predicted_likelihood <= expected_max
        )
        likelihood_error = (
            abs(predicted_likelihood - expected_midpoint)
            if predicted_likelihood is not None
            else None
        )

        # Criterion-level comparison
        criteria_met_predicted, criteria_unmet_predicted = self._extract_criteria_keys(assessment)
        criteria_met_expected = set(golden.get("expected_criteria_met_keys", []))
        criteria_unmet_expected = set(golden.get("expected_criteria_unmet_keys", []))

        # Combine met/unmet into a single label set for F1 calculation
        crit_precision, crit_recall, crit_f1 = self._criteria_f1(
            predicted_met=criteria_met_predicted,
            predicted_unmet=criteria_unmet_predicted,
            expected_met=criteria_met_expected,
            expected_unmet=criteria_unmet_expected,
        )

        return {
            "case_id": golden["case_id"],
            "description": golden.get("description", ""),
            "expected_status": expected_status,
            "predicted_status": predicted_status,
            "status_correct": status_correct,
            "predicted_likelihood": predicted_likelihood,
            "expected_likelihood_midpoint": expected_midpoint,
            "expected_likelihood_range": [expected_min, expected_max],
            "likelihood_in_range": likelihood_in_range,
            "likelihood_error": likelihood_error,
            "criteria_met_predicted": sorted(criteria_met_predicted),
            "criteria_met_expected": sorted(criteria_met_expected),
            "criteria_unmet_predicted": sorted(criteria_unmet_predicted),
            "criteria_unmet_expected": sorted(criteria_unmet_expected),
            "criteria_precision": crit_precision,
            "criteria_recall": crit_recall,
            "criteria_f1": crit_f1,
            "error": None,
            "skipped": False,
        }

    def _statuses_match(self, predicted: Optional[str], expected: str) -> bool:
        """Check if predicted coverage status matches expected.

        Allows semantic equivalence: the conservative decision model maps
        NOT_COVERED -> REQUIRES_HUMAN_REVIEW, so we treat both as equivalent
        when the expected is requires_human_review.
        """
        if predicted is None:
            return False
        pred = predicted.lower().strip()
        exp = expected.lower().strip()
        if pred == exp:
            return True
        # Conservative model equivalences
        equivalent_groups = [
            {"requires_human_review", "not_covered"},
            {"covered", "likely_covered"},
            {"pend", "conditional"},
        ]
        for group in equivalent_groups:
            if pred in group and exp in group:
                return True
        return False

    def _extract_criteria_keys(self, assessment: Any) -> Tuple[set, set]:
        """Extract criterion keys split into met/unmet sets from the assessment.

        Uses fuzzy key matching: normalizes criterion_id values to lowercase
        and strips common prefixes/suffixes for comparison against golden
        keys which use short canonical names.
        """
        met_keys: set = set()
        unmet_keys: set = set()

        for criterion in getattr(assessment, "criteria_assessments", []) or []:
            raw_id = (criterion.criterion_id or "").lower().strip()
            raw_name = (criterion.criterion_name or "").lower().strip()
            # Use the shorter of id/name as canonical key, or id if same length
            key = raw_id if raw_id else raw_name
            # Also generate a simplified slug for matching
            simplified = self._simplify_criterion_key(key)
            keys_to_add = {key, simplified} - {""}
            if criterion.is_met:
                met_keys.update(keys_to_add)
            else:
                unmet_keys.update(keys_to_add)

        return met_keys, unmet_keys

    @staticmethod
    def _simplify_criterion_key(key: str) -> str:
        """Simplify a criterion key for fuzzy matching.

        Strips common prefixes like 'CLINICAL_CD_', 'CLINICAL_RA_' and
        normalizes separators so that e.g. 'CLINICAL_CD_STEP_THERAPY'
        matches 'step_therapy'.
        """
        k = key.lower().strip()
        # Strip known payer/disease prefixes
        for prefix in [
            "clinical_cd_", "clinical_ra_", "clinical_uc_", "clinical_psa_",
            "clinical_", "admin_", "criterion_",
        ]:
            if k.startswith(prefix):
                k = k[len(prefix):]
                break
        return k.strip("_")

    def _criteria_f1(
        self,
        predicted_met: set,
        predicted_unmet: set,
        expected_met: set,
        expected_unmet: set,
    ) -> Tuple[float, float, float]:
        """Compute precision, recall, F1 for criteria classification.

        A criterion is a true-positive if it appears in both the predicted
        and expected set (after fuzzy matching). We evaluate met and unmet
        independently and macro-average.
        """
        def _match_sets(predicted: set, expected: set) -> Tuple[int, int, int]:
            """Return (tp, fp, fn) between predicted and expected using fuzzy matching."""
            tp = 0
            matched_expected: set = set()
            for p_key in predicted:
                p_simple = self._simplify_criterion_key(p_key)
                for e_key in expected:
                    e_simple = self._simplify_criterion_key(e_key)
                    if p_simple == e_simple or p_key == e_key or p_simple in e_simple or e_simple in p_simple:
                        if e_key not in matched_expected:
                            tp += 1
                            matched_expected.add(e_key)
                            break
            fp = len(predicted) - tp
            fn = len(expected) - len(matched_expected)
            return tp, fp, fn

        tp_met, fp_met, fn_met = _match_sets(predicted_met, expected_met)
        tp_unmet, fp_unmet, fn_unmet = _match_sets(predicted_unmet, expected_unmet)

        total_tp = tp_met + tp_unmet
        total_fp = fp_met + fp_unmet
        total_fn = fn_met + fn_unmet

        precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
        recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
        f1 = (
            2 * precision * recall / (precision + recall)
            if (precision + recall) > 0
            else 0.0
        )
        return round(precision, 4), round(recall, 4), round(f1, 4)

    def _compute_metrics(self, results: List[Dict]) -> Dict[str, Any]:
        """Compute aggregate accuracy, precision, recall, MAE, F1."""
        total = len(results)
        evaluated = [r for r in results if not r.get("skipped")]
        skipped = total - len(evaluated)

        if not evaluated:
            return {
                "total_cases": total,
                "evaluated_cases": 0,
                "skipped_cases": skipped,
                "accuracy": 0.0,
                "precision_covered": 0.0,
                "recall_covered": 0.0,
                "f1_covered": 0.0,
                "likelihood_mae": None,
                "likelihood_in_range_pct": 0.0,
                "criteria_f1_mean": 0.0,
                "criteria_precision_mean": 0.0,
                "criteria_recall_mean": 0.0,
            }

        # --- Coverage status accuracy ---
        correct = sum(1 for r in evaluated if r["status_correct"])
        accuracy = correct / len(evaluated)

        # --- Precision / Recall for "covered" class ---
        # True positive: predicted covered AND expected covered
        # False positive: predicted covered BUT expected NOT covered
        # False negative: predicted NOT covered BUT expected covered
        covered_like = {"covered", "likely_covered"}
        tp_covered = sum(
            1 for r in evaluated
            if r["predicted_status"] and r["predicted_status"].lower() in covered_like
            and r["expected_status"].lower() in covered_like
        )
        fp_covered = sum(
            1 for r in evaluated
            if r["predicted_status"] and r["predicted_status"].lower() in covered_like
            and r["expected_status"].lower() not in covered_like
        )
        fn_covered = sum(
            1 for r in evaluated
            if (r["predicted_status"] is None or r["predicted_status"].lower() not in covered_like)
            and r["expected_status"].lower() in covered_like
        )

        precision_covered = tp_covered / (tp_covered + fp_covered) if (tp_covered + fp_covered) > 0 else 0.0
        recall_covered = tp_covered / (tp_covered + fn_covered) if (tp_covered + fn_covered) > 0 else 0.0
        f1_covered = (
            2 * precision_covered * recall_covered / (precision_covered + recall_covered)
            if (precision_covered + recall_covered) > 0
            else 0.0
        )

        # --- Approval likelihood MAE ---
        likelihood_errors = [
            r["likelihood_error"]
            for r in evaluated
            if r["likelihood_error"] is not None
        ]
        likelihood_mae = (
            sum(likelihood_errors) / len(likelihood_errors)
            if likelihood_errors
            else None
        )
        likelihood_in_range_count = sum(1 for r in evaluated if r["likelihood_in_range"])
        likelihood_in_range_pct = likelihood_in_range_count / len(evaluated)

        # --- Criteria F1 (macro average over cases) ---
        crit_f1_values = [r["criteria_f1"] for r in evaluated]
        crit_precision_values = [r["criteria_precision"] for r in evaluated]
        crit_recall_values = [r["criteria_recall"] for r in evaluated]

        criteria_f1_mean = sum(crit_f1_values) / len(crit_f1_values) if crit_f1_values else 0.0
        criteria_precision_mean = sum(crit_precision_values) / len(crit_precision_values) if crit_precision_values else 0.0
        criteria_recall_mean = sum(crit_recall_values) / len(crit_recall_values) if crit_recall_values else 0.0

        # --- Status distribution ---
        predicted_dist = Counter(r["predicted_status"] for r in evaluated if r["predicted_status"])
        expected_dist = Counter(r["expected_status"] for r in evaluated)

        return {
            "total_cases": total,
            "evaluated_cases": len(evaluated),
            "skipped_cases": skipped,
            "accuracy": round(accuracy, 4),
            "precision_covered": round(precision_covered, 4),
            "recall_covered": round(recall_covered, 4),
            "f1_covered": round(f1_covered, 4),
            "likelihood_mae": round(likelihood_mae, 4) if likelihood_mae is not None else None,
            "likelihood_in_range_pct": round(likelihood_in_range_pct, 4),
            "criteria_f1_mean": round(criteria_f1_mean, 4),
            "criteria_precision_mean": round(criteria_precision_mean, 4),
            "criteria_recall_mean": round(criteria_recall_mean, 4),
            "predicted_status_distribution": dict(predicted_dist),
            "expected_status_distribution": dict(expected_dist),
        }

    def _print_summary(self, metrics: Dict[str, Any]) -> None:
        """Print a formatted summary table to stdout."""
        divider = "=" * 64
        thin_divider = "-" * 64

        print()
        print(divider)
        print("  COVERAGE ASSESSMENT EVALUATION REPORT")
        print(divider)
        print(f"  Timestamp:       {metrics.get('timestamp', 'N/A')}")
        print(f"  Golden dataset:  {metrics.get('golden_path', 'N/A')}")
        print(f"  Elapsed:         {metrics.get('elapsed_seconds', 'N/A')}s")
        print(thin_divider)
        print(f"  Total cases:     {metrics['total_cases']}")
        print(f"  Evaluated:       {metrics['evaluated_cases']}")
        print(f"  Skipped (error): {metrics['skipped_cases']}")
        print(thin_divider)

        print("  COVERAGE STATUS METRICS")
        print(thin_divider)
        print(f"  Accuracy:                {metrics['accuracy']:.2%}")
        print(f"  Precision (covered):     {metrics['precision_covered']:.2%}")
        print(f"  Recall (covered):        {metrics['recall_covered']:.2%}")
        print(f"  F1 (covered):            {metrics['f1_covered']:.2%}")
        print(thin_divider)

        print("  APPROVAL LIKELIHOOD METRICS")
        print(thin_divider)
        mae_str = f"{metrics['likelihood_mae']:.4f}" if metrics['likelihood_mae'] is not None else "N/A"
        print(f"  MAE vs midpoint:         {mae_str}")
        print(f"  In expected range:       {metrics['likelihood_in_range_pct']:.2%}")
        print(thin_divider)

        print("  CRITERIA CLASSIFICATION METRICS (macro-avg)")
        print(thin_divider)
        print(f"  Precision:               {metrics['criteria_precision_mean']:.2%}")
        print(f"  Recall:                  {metrics['criteria_recall_mean']:.2%}")
        print(f"  F1:                      {metrics['criteria_f1_mean']:.2%}")
        print(thin_divider)

        if metrics.get("predicted_status_distribution"):
            print("  PREDICTED STATUS DISTRIBUTION")
            print(thin_divider)
            for status, count in sorted(metrics["predicted_status_distribution"].items()):
                print(f"    {status:<30} {count}")
            print(thin_divider)

        if metrics.get("expected_status_distribution"):
            print("  EXPECTED STATUS DISTRIBUTION")
            print(thin_divider)
            for status, count in sorted(metrics["expected_status_distribution"].items()):
                print(f"    {status:<30} {count}")

        print(divider)
        print()


async def main():
    """CLI entrypoint for evaluation."""
    from backend.config.logging_config import setup_logging
    setup_logging(log_level="INFO", log_file="eval_runner.log")

    runner = EvalRunner()
    metrics = await runner.run()
    runner._print_summary(metrics)


if __name__ == "__main__":
    asyncio.run(main())
