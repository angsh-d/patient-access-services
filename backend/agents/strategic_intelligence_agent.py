"""
Strategic Intelligence Agent - Analyzes historical PA data to provide
goal-based planning, pattern recognition, and counterfactual reasoning.

This demonstrates genuine agentic AI capabilities:
- Learning from historical outcomes
- Similarity-based case matching
- Multi-step reasoning
- Counterfactual analysis
- Predictive documentation gap analysis
"""
import json
import hashlib
import math
import uuid
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, delete

from backend.models.enums import TaskCategory
from backend.reasoning.llm_gateway import get_llm_gateway
from backend.reasoning.prompt_loader import get_prompt_loader
from backend.config.logging_config import get_logger
from backend.config.settings import get_settings
from backend.storage.database import get_db
from backend.storage.models import StrategicIntelligenceCacheModel, CohortAnalysisCacheModel

logger = get_logger(__name__)

# Default cache TTL in hours (can be overridden via environment)
DEFAULT_CACHE_TTL_HOURS = 24


class SimilarCase:
    """A historical case with similarity metrics."""

    def __init__(
        self,
        case_id: str,
        similarity_score: float,
        case_data: Dict[str, Any],
        similarity_breakdown: Dict[str, float]
    ):
        self.case_id = case_id
        self.similarity_score = similarity_score
        self.case_data = case_data
        self.similarity_breakdown = similarity_breakdown


class StrategicInsights:
    """Structured strategic insights from analysis."""

    def __init__(
        self,
        similar_cases_count: int,
        approval_rate_for_similar: float,
        denial_rate_for_similar: float,
        info_request_rate_for_similar: float,
        avg_days_to_decision: float,
        documentation_insights: List[Dict[str, Any]],
        payer_insights: Dict[str, Any],
        timing_recommendations: Dict[str, Any],
        risk_factors: List[Dict[str, Any]],
        recommended_actions: List[Dict[str, Any]],
        counterfactual_scenarios: List[Dict[str, Any]],
        reasoning_chain: List[Dict[str, Any]],
        confidence_score: float,
        confidence_reasoning: str,
        compensating_factors: Optional[List[Dict[str, Any]]] = None,
        agentic_insights: Optional[List[Dict[str, Any]]] = None,
        evidence_summary: Optional[Dict[str, Any]] = None,
        cohort_summary: Optional[Dict[str, Any]] = None,
        patient_position: Optional[Dict[str, Any]] = None,
        statistical_validity: Optional[str] = None,
        statistical_warnings: Optional[List[str]] = None,
    ):
        self.similar_cases_count = similar_cases_count
        self.approval_rate_for_similar = approval_rate_for_similar
        self.denial_rate_for_similar = denial_rate_for_similar
        self.info_request_rate_for_similar = info_request_rate_for_similar
        self.avg_days_to_decision = avg_days_to_decision
        self.documentation_insights = documentation_insights
        self.payer_insights = payer_insights
        self.timing_recommendations = timing_recommendations
        self.risk_factors = risk_factors
        self.recommended_actions = recommended_actions
        self.counterfactual_scenarios = counterfactual_scenarios
        self.reasoning_chain = reasoning_chain
        self.confidence_score = confidence_score
        self.confidence_reasoning = confidence_reasoning
        self.compensating_factors = compensating_factors or []
        self.agentic_insights = agentic_insights or []
        self.evidence_summary = evidence_summary or {}
        self.cohort_summary = cohort_summary
        self.patient_position = patient_position
        self.statistical_validity = statistical_validity
        self.statistical_warnings = statistical_warnings or []

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response matching frontend interface."""
        return {
            "similar_cases": {
                "count": self.similar_cases_count,
                "approval_rate": self.approval_rate_for_similar,
                "denial_rate": self.denial_rate_for_similar,
                "info_request_rate": self.info_request_rate_for_similar,
                "avg_days_to_decision": self.avg_days_to_decision
            },
            "documentation_insights": self.documentation_insights,
            "payer_insights": self.payer_insights,
            "timing_recommendations": self.timing_recommendations,
            "risk_factors": self.risk_factors,
            "recommended_actions": self.recommended_actions,
            "counterfactual_scenarios": self.counterfactual_scenarios,
            "reasoning_chain": self.reasoning_chain,
            "confidence_score": self.confidence_score,
            "confidence_reasoning": self.confidence_reasoning,
            "compensating_factors": self.compensating_factors,
            "agentic_insights": self.agentic_insights,
            "evidence_summary": self.evidence_summary,
            "cohort_summary": self.cohort_summary,
            "patient_position": self.patient_position,
            "statistical_validity": self.statistical_validity,
            "statistical_warnings": self.statistical_warnings,
        }


class StrategicIntelligenceAgent:
    """
    Agent that analyzes historical PA data to provide strategic intelligence.

    Key capabilities:
    - Find clinically similar historical cases
    - Analyze patterns to generate insights
    - Provide counterfactual reasoning
    - Generate actionable recommendations with confidence scores
    """

    # Similarity weights for case matching
    SIMILARITY_WEIGHTS = {
        "medication": 0.30,       # Same medication is highly important
        "diagnosis_family": 0.25, # Same ICD-10 family (first 3 chars)
        "payer": 0.20,           # Same payer has same requirements
        "disease_severity": 0.15, # Similar severity classification
        "prior_treatments": 0.10  # Similar treatment history
    }

    # Severity tolerance for matching (20%)
    SEVERITY_TOLERANCE = 0.20

    def __init__(self, historical_data_path: Optional[Path] = None, cache_ttl_hours: int = DEFAULT_CACHE_TTL_HOURS):
        """
        Initialize the strategic intelligence agent.

        Args:
            historical_data_path: Path to historical PA cases JSON file
            cache_ttl_hours: TTL for cached strategic intelligence results (default: 24 hours)
        """
        self.historical_data_path = historical_data_path or Path(get_settings().historical_data_path)
        self._historical_data: Optional[Dict[str, Any]] = None
        self._historical_cases: Optional[List[Dict[str, Any]]] = None
        self.llm_gateway = get_llm_gateway()
        self.prompt_loader = get_prompt_loader()
        self.cache_ttl_hours = cache_ttl_hours
        logger.info("Strategic Intelligence Agent initialized", cache_ttl_hours=cache_ttl_hours)

    @property
    def historical_data(self) -> Dict[str, Any]:
        """Lazy-load historical data."""
        if self._historical_data is None:
            self._load_historical_data()
        return self._historical_data

    @property
    def historical_cases(self) -> List[Dict[str, Any]]:
        """Get historical cases list."""
        if self._historical_cases is None:
            self._load_historical_data()
        return self._historical_cases

    def _load_historical_data(self) -> None:
        """Load historical PA cases from JSON file."""
        if not self.historical_data_path.exists():
            raise FileNotFoundError(
                f"Historical PA cases file not found: {self.historical_data_path}"
            )

        # Synchronous read — acceptable since this is a one-time lazy load
        # cached for the singleton lifetime. Making this async would require
        # changing all property callers to async, with minimal benefit for a
        # single file read.
        with open(self.historical_data_path, "r", encoding="utf-8") as f:
            self._historical_data = json.load(f)

        self._historical_cases = self._historical_data.get("cases", [])
        logger.info(
            "Loaded historical PA cases",
            count=len(self._historical_cases),
            path=str(self.historical_data_path)
        )

    def _generate_cache_key(
        self,
        medication_name: str,
        icd10_code: str,
        payer_name: str,
        disease_severity: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a deterministic cache key hash from similarity parameters.

        The cache key is based ONLY on parameters that affect which similar
        cases are matched - NOT on case_id or current documentation.
        This allows different cases with the same medication/payer/diagnosis
        to share cached strategic intelligence.
        """
        # Normalize inputs - only parameters that affect similarity matching
        key_parts = [
            medication_name.lower().strip(),
            icd10_code[:3].upper() if icd10_code else "",  # ICD-10 family
            payer_name.lower().strip(),
        ]

        # Generate SHA-256 hash (no severity — intentionally broad, matching cohort cache key)
        key_string = "::".join(key_parts)
        return hashlib.sha256(key_string.encode()).hexdigest()

    async def _get_cached_intelligence(
        self,
        cache_key_hash: str
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve cached strategic intelligence if available and not expired.

        Returns:
            Cached intelligence data dict or None if not found/expired
        """
        try:
            async with get_db() as db:
                stmt = select(StrategicIntelligenceCacheModel).where(
                    StrategicIntelligenceCacheModel.cache_key_hash == cache_key_hash
                )
                result = await db.execute(stmt)
                cache_entry = result.scalar_one_or_none()

                if cache_entry is None:
                    logger.debug("Cache miss", cache_key_hash=cache_key_hash[:16])
                    return None

                # Cache never expires — manual invalidation only
                # if cache_entry.is_expired():
                #     ...

                logger.info(
                    "Cache hit",
                    cache_key_hash=cache_key_hash[:16],
                    cached_at=cache_entry.cached_at.isoformat(),
                    similar_cases=cache_entry.similar_cases_count
                )
                return cache_entry.intelligence_data

        except Exception as e:
            logger.warning("Cache retrieval error, will regenerate", error=str(e))
            return None

    async def _set_cached_intelligence(
        self,
        case_id: str,
        cache_key_hash: str,
        medication_name: str,
        icd10_code: str,
        payer_name: str,
        insights: "StrategicInsights"
    ) -> None:
        """
        Store strategic intelligence results in cache.

        Args:
            case_id: Case identifier
            cache_key_hash: Generated cache key hash
            medication_name: Medication name for debugging
            icd10_code: ICD-10 code for debugging
            payer_name: Payer name for debugging
            insights: StrategicInsights object to cache
        """
        try:
            async with get_db() as db:
                # Remove any existing entry with same key (upsert behavior)
                await db.execute(
                    delete(StrategicIntelligenceCacheModel).where(
                        StrategicIntelligenceCacheModel.cache_key_hash == cache_key_hash
                    )
                )

                # Create new cache entry
                cache_entry = StrategicIntelligenceCacheModel(
                    id=str(uuid.uuid4()),
                    case_id=case_id,
                    cache_key_hash=cache_key_hash,
                    medication_name=medication_name,
                    icd10_code=icd10_code,
                    payer_name=payer_name,
                    cached_at=datetime.now(timezone.utc),
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=self.cache_ttl_hours),
                    intelligence_data=insights.to_dict(),
                    similar_cases_count=insights.similar_cases_count,
                    confidence_score=insights.confidence_score
                )
                db.add(cache_entry)
                await db.commit()

                logger.info(
                    "Cached strategic intelligence",
                    case_id=case_id,
                    cache_key_hash=cache_key_hash[:16],
                    ttl_hours=self.cache_ttl_hours,
                    similar_cases=insights.similar_cases_count
                )

        except Exception as e:
            logger.warning("Cache storage error", error=str(e))
            # Don't fail the request if caching fails

    async def invalidate_cache_for_case(self, case_id: str) -> int:
        """
        Invalidate all cached intelligence for a specific case.

        Use this when case data changes significantly.

        Returns:
            Number of cache entries deleted
        """
        try:
            async with get_db() as db:
                stmt = delete(StrategicIntelligenceCacheModel).where(
                    StrategicIntelligenceCacheModel.case_id == case_id
                )
                result = await db.execute(stmt)
                deleted_count = result.rowcount
                await db.commit()

                if deleted_count > 0:
                    logger.info("Invalidated cache for case", case_id=case_id, deleted_count=deleted_count)
                return deleted_count

        except Exception as e:
            logger.warning("Cache invalidation error", case_id=case_id, error=str(e))
            return 0

    async def cleanup_expired_cache(self) -> int:
        """
        Remove all expired cache entries.

        Returns:
            Number of expired entries deleted
        """
        try:
            async with get_db() as db:
                stmt = delete(StrategicIntelligenceCacheModel).where(
                    StrategicIntelligenceCacheModel.expires_at < datetime.now(timezone.utc)
                )
                result = await db.execute(stmt)
                deleted_count = result.rowcount
                await db.commit()

                if deleted_count > 0:
                    logger.info("Cleaned up expired cache entries", deleted_count=deleted_count)
                return deleted_count

        except Exception as e:
            logger.warning("Cache cleanup error", error=str(e))
            return 0

    def find_similar_cases(
        self,
        medication_name: str,
        icd10_code: str,
        payer_name: str,
        disease_severity: Optional[Dict[str, Any]] = None,
        prior_treatments: Optional[List[Dict[str, Any]]] = None,
        min_similarity: float = 0.5,
        max_results: int = 20
    ) -> List[SimilarCase]:
        """
        Find clinically similar cases from historical data.

        Args:
            medication_name: Requested medication name
            icd10_code: Primary ICD-10 diagnosis code
            payer_name: Insurance payer name
            disease_severity: Disease severity metrics (CDAI, HBI, etc.)
            prior_treatments: List of prior treatments tried
            min_similarity: Minimum similarity score threshold
            max_results: Maximum number of similar cases to return

        Returns:
            List of SimilarCase objects sorted by similarity
        """
        similar_cases = []
        icd10_family = icd10_code[:3] if icd10_code else ""

        for case in self.historical_cases:
            similarity_breakdown = self._calculate_similarity(
                case=case,
                medication_name=medication_name,
                icd10_family=icd10_family,
                payer_name=payer_name,
                disease_severity=disease_severity,
                prior_treatments=prior_treatments
            )

            # Calculate weighted total score
            total_score = sum(
                score * self.SIMILARITY_WEIGHTS.get(component, 0)
                for component, score in similarity_breakdown.items()
            )

            if total_score >= min_similarity:
                similar_cases.append(SimilarCase(
                    case_id=case.get("case_id", "unknown"),
                    similarity_score=total_score,
                    case_data=case,
                    similarity_breakdown=similarity_breakdown
                ))

        # Sort by similarity score descending
        similar_cases.sort(key=lambda x: x.similarity_score, reverse=True)

        logger.info(
            "Found similar cases",
            total_matches=len(similar_cases),
            returning=min(len(similar_cases), max_results)
        )

        return similar_cases[:max_results]

    def _calculate_similarity(
        self,
        case: Dict[str, Any],
        medication_name: str,
        icd10_family: str,
        payer_name: str,
        disease_severity: Optional[Dict[str, Any]] = None,
        prior_treatments: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, float]:
        """
        Calculate similarity scores for each component.

        Returns:
            Dictionary of component scores (0.0 to 1.0)
        """
        scores = {}

        # Medication similarity (exact or generic match)
        case_med = case.get("medication", {}).get("name", "").lower()
        if medication_name.lower() in case_med or case_med in medication_name.lower():
            scores["medication"] = 1.0
        else:
            scores["medication"] = 0.0

        # Diagnosis family similarity
        case_icd_family = case.get("diagnosis", {}).get("icd10_family", "")
        if icd10_family and case_icd_family == icd10_family:
            scores["diagnosis_family"] = 1.0
        elif icd10_family and case_icd_family[:2] == icd10_family[:2]:
            scores["diagnosis_family"] = 0.7  # Same chapter
        else:
            scores["diagnosis_family"] = 0.0

        # Payer similarity
        case_payer = case.get("payer", {}).get("name", "").lower()
        if payer_name.lower() in case_payer or case_payer in payer_name.lower():
            scores["payer"] = 1.0
        else:
            scores["payer"] = 0.0

        # Disease severity similarity
        scores["disease_severity"] = self._calculate_severity_similarity(
            case.get("disease_severity", {}),
            disease_severity
        )

        # Prior treatments similarity
        scores["prior_treatments"] = self._calculate_treatment_similarity(
            case.get("prior_treatments", []),
            prior_treatments
        )

        return scores

    def _calculate_severity_similarity(
        self,
        case_severity: Dict[str, Any],
        target_severity: Optional[Dict[str, Any]]
    ) -> float:
        """Calculate similarity between disease severity profiles."""
        if not target_severity:
            return 0.5  # Neutral if no target severity provided

        # Compare severity classification
        case_class = case_severity.get("severity_classification", "").lower()
        target_class = target_severity.get("severity_classification", "").lower()

        if case_class == target_class:
            return 1.0

        # Partial match for adjacent severity levels
        severity_order = ["mild", "moderate", "moderate_to_severe", "severe"]
        if case_class in severity_order and target_class in severity_order:
            case_idx = severity_order.index(case_class)
            target_idx = severity_order.index(target_class)
            diff = abs(case_idx - target_idx)
            if diff == 1:
                return 0.7
            elif diff == 2:
                return 0.4

        # Compare numeric scores if available
        numeric_scores = []

        # CDAI score comparison (typical range 0-600)
        case_cdai = case_severity.get("cdai_score")
        target_cdai = target_severity.get("cdai_score")
        if case_cdai and target_cdai:
            diff_pct = abs(case_cdai - target_cdai) / max(case_cdai, target_cdai, 1)
            if diff_pct <= self.SEVERITY_TOLERANCE:
                numeric_scores.append(1.0 - diff_pct)
            else:
                numeric_scores.append(max(0, 1.0 - diff_pct * 2))

        # HBI score comparison (typical range 0-20)
        case_hbi = case_severity.get("hbi_score")
        target_hbi = target_severity.get("hbi_score")
        if case_hbi and target_hbi:
            diff_pct = abs(case_hbi - target_hbi) / max(case_hbi, target_hbi, 1)
            if diff_pct <= self.SEVERITY_TOLERANCE:
                numeric_scores.append(1.0 - diff_pct)
            else:
                numeric_scores.append(max(0, 1.0 - diff_pct * 2))

        if numeric_scores:
            return sum(numeric_scores) / len(numeric_scores)

        return 0.3  # Low score if no matching criteria

    def _calculate_treatment_similarity(
        self,
        case_treatments: List[Dict[str, Any]],
        target_treatments: Optional[List[Dict[str, Any]]]
    ) -> float:
        """Calculate similarity between prior treatment histories."""
        if not target_treatments or not case_treatments:
            return 0.5  # Neutral if no treatment data

        # Extract medication names from both lists
        case_meds = {t.get("medication", "").lower() for t in case_treatments}
        target_meds = {t.get("medication", "").lower() for t in target_treatments}

        if not case_meds or not target_meds:
            return 0.5

        # Jaccard similarity
        intersection = len(case_meds & target_meds)
        union = len(case_meds | target_meds)

        return intersection / union if union > 0 else 0.0

    def analyze_patterns(
        self,
        similar_cases: List[SimilarCase],
        payer_name: str,
        current_documentation: Optional[List[str]] = None,
        current_severity: Optional[Dict[str, Any]] = None,
        medication_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze patterns from similar cases to generate insights.

        Args:
            similar_cases: List of similar historical cases
            payer_name: Target payer name
            current_documentation: List of documentation already present
            current_severity: Current case disease severity data
            medication_name: Medication name for expanded pattern search

        Returns:
            Dictionary of pattern analysis results
        """
        if not similar_cases:
            return {
                "approval_rate": 0.0,
                "info_request_rate": 0.0,
                "denial_rate": 0.0,
                "avg_days_to_decision": 7.0,
                "documentation_patterns": [],
                "timing_patterns": [],
                "denial_reasons": [],
                "compensating_factors": []
            }

        current_documentation = current_documentation or []
        current_docs_lower = {d.lower() for d in current_documentation}

        # Calculate outcome rates — use resolved_total (approved + denied) for
        # approval/denial rates to match cohort analysis denominator
        total = len(similar_cases)
        approved = sum(1 for c in similar_cases if c.case_data.get("outcome") == "approved")
        info_requests = sum(1 for c in similar_cases if c.case_data.get("outcome") == "info_request")
        denied = sum(1 for c in similar_cases if c.case_data.get("outcome") == "denied")
        resolved_total = approved + denied  # Excludes info_request for approval/denial rates

        sample_approved_ids = [c.case_id for c in similar_cases if c.case_data.get("outcome") == "approved"][:5]
        sample_denied_ids = [c.case_id for c in similar_cases if c.case_data.get("outcome") == "denied"][:5]

        # Analyze documentation patterns
        doc_patterns = self._analyze_documentation_patterns(
            similar_cases, current_docs_lower
        )

        # Analyze timing patterns
        timing_patterns = self._analyze_timing_patterns(similar_cases)

        # Analyze compensating factors (key agentic capability)
        compensating_factors = self._analyze_compensating_factors(
            similar_cases, current_docs_lower, current_severity,
            medication_name=medication_name, payer_name=payer_name
        )

        # Collect denial reasons
        denial_reasons = []
        days_list = []
        for case in similar_cases:
            reason = case.case_data.get("denial_reason")
            if reason:
                denial_reasons.append({
                    "case_id": case.case_id,
                    "reason": reason,
                    "appeal_filed": case.case_data.get("appeal_filed", False),
                    "appeal_outcome": case.case_data.get("appeal_outcome")
                })
            # Collect days to decision
            days = case.case_data.get("days_to_decision")
            if days:
                days_list.append(days)

        # Calculate average days to decision
        avg_days = sum(days_list) / len(days_list) if days_list else 7.0

        return {
            "approval_rate": approved / resolved_total if resolved_total > 0 else 0.0,
            "info_request_rate": info_requests / total if total > 0 else 0.0,
            "denial_rate": denied / resolved_total if resolved_total > 0 else 0.0,
            "avg_days_to_decision": round(avg_days, 1),
            "documentation_patterns": doc_patterns,
            "timing_patterns": timing_patterns,
            "denial_reasons": denial_reasons,
            "compensating_factors": compensating_factors,
            "evidence_summary": {
                "total_similar_cases": total,
                "outcome_breakdown": {
                    "approved": approved,
                    "denied": denied,
                    "info_requested": info_requests,
                },
                "sample_approved_case_ids": sample_approved_ids,
                "sample_denied_case_ids": sample_denied_ids,
                "methodology": (
                    f"Matched {total} historical cases by medication, diagnosis family, payer, "
                    f"disease severity, and prior treatment history. "
                    f"Outcomes: {approved} approved ({approved/total:.0%}), "
                    f"{denied} denied ({denied/total:.0%}), "
                    f"{info_requests} info requested ({info_requests/total:.0%}). "
                    f"Average {avg_days:.1f} days to decision."
                ),
            },
        }

    def _analyze_documentation_patterns(
        self,
        similar_cases: List[SimilarCase],
        current_docs: set
    ) -> List[Dict[str, Any]]:
        """Analyze which documentation impacts approval rates."""
        doc_impact = {}

        for case in similar_cases:
            docs_present = set(d.lower() for d in case.case_data.get("documentation_present", []))
            docs_missing = set(d.lower() for d in case.case_data.get("documentation_missing", []))
            outcome = case.case_data.get("outcome", "unknown")

            # Track impact of each document type
            for doc in docs_present:
                if doc not in doc_impact:
                    doc_impact[doc] = {"present_approved": 0, "present_total": 0, "missing_approved": 0, "missing_total": 0}
                doc_impact[doc]["present_total"] += 1
                if outcome == "approved":
                    doc_impact[doc]["present_approved"] += 1

            for doc in docs_missing:
                if doc not in doc_impact:
                    doc_impact[doc] = {"present_approved": 0, "present_total": 0, "missing_approved": 0, "missing_total": 0}
                doc_impact[doc]["missing_total"] += 1
                if outcome == "approved":
                    doc_impact[doc]["missing_approved"] += 1

        # Calculate impact scores
        patterns = []
        for doc, stats in doc_impact.items():
            if stats["present_total"] > 0 and stats["missing_total"] > 0:
                present_rate = stats["present_approved"] / stats["present_total"]
                missing_rate = stats["missing_approved"] / stats["missing_total"]
                impact = present_rate - missing_rate

                if abs(impact) > 0.1:  # Significant impact threshold
                    is_present = doc in current_docs
                    patterns.append({
                        "documentation_type": doc,
                        "approval_rate_with": present_rate,
                        "approval_rate_without": missing_rate,
                        "impact_delta": impact,
                        "is_present_in_current_case": is_present,
                        "recommendation": "already included" if is_present else "recommend adding",
                        "cases_with": stats["present_total"],
                        "cases_without": stats["missing_total"],
                    })

        # Sort by impact
        patterns.sort(key=lambda x: abs(x["impact_delta"]), reverse=True)
        return patterns

    def _analyze_timing_patterns(
        self,
        similar_cases: List[SimilarCase]
    ) -> List[Dict[str, Any]]:
        """Analyze timing patterns that affect outcomes."""
        patterns = []

        # Analyze by day of week
        day_outcomes = {}
        for case in similar_cases:
            day = case.case_data.get("submission_day_of_week", "Unknown")
            if day not in day_outcomes:
                day_outcomes[day] = {"approved": 0, "total": 0, "avg_days": []}

            day_outcomes[day]["total"] += 1
            days_to_decision = case.case_data.get("days_to_decision")
            if days_to_decision:
                day_outcomes[day]["avg_days"].append(days_to_decision)

            if case.case_data.get("outcome") == "approved":
                day_outcomes[day]["approved"] += 1

        for day, stats in day_outcomes.items():
            if stats["total"] >= 3:  # Minimum sample size
                avg_days = sum(stats["avg_days"]) / len(stats["avg_days"]) if stats["avg_days"] else 0
                patterns.append({
                    "pattern_type": "submission_day",
                    "day": day,
                    "approval_rate": stats["approved"] / stats["total"],
                    "avg_days_to_decision": round(avg_days, 1),
                    "sample_size": stats["total"]
                })

        return patterns

    def _analyze_compensating_factors(
        self,
        similar_cases: List[SimilarCase],
        current_docs: set,
        current_severity: Optional[Dict[str, Any]] = None,
        medication_name: Optional[str] = None,
        payer_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Analyze multi-variable patterns where one factor compensates for another.

        This is a key agentic capability: discovering non-obvious correlations
        that experienced PA specialists learn through years of practice.

        Example patterns:
        - Missing TB screening + severe disease markers → approved
        - Missing step therapy + physician attestation → approved
        - Missing fecal calprotectin + recent endoscopy → approved

        Note: Uses ALL historical cases with same medication+payer for pattern analysis,
        not just the highly similar cases. This ensures we catch compensating patterns
        even when they involve cases with different severity levels.
        """
        compensating_patterns = []

        # Get ALL cases with same medication/payer for comprehensive pattern analysis
        # This is critical - we need both severe+approved AND mild+denied cases to detect patterns
        all_relevant_cases = []
        for case in self.historical_data.get("cases", []):
            case_med = case.get("medication", {}).get("name", "").lower()
            case_payer = case.get("payer", {}).get("name", "").lower()

            # Check for medication match (more lenient matching)
            # Uses medication aliases from config for brand/generic resolution
            med_match = False
            if medication_name:
                med_lower = medication_name.lower()
                if med_lower in case_med or case_med in med_lower:
                    med_match = True
                # Also match on brand/generic aliases from config
                if not med_match:
                    from backend.policy_digitalization.pipeline import MEDICATION_NAME_ALIASES
                    alias = MEDICATION_NAME_ALIASES.get(med_lower, "")
                    if alias and (alias in case_med or case_med in alias):
                        med_match = True

            # Check for payer match
            payer_match = False
            if payer_name:
                payer_lower = payer_name.lower()
                if payer_lower in case_payer or case_payer in payer_lower:
                    payer_match = True

            # Include if medication matches (payer match optional for more data)
            if med_match:
                all_relevant_cases.append(case)

        logger.info(
            "Compensating factor analysis: using all relevant cases",
            medication=medication_name,
            payer=payer_name,
            total_relevant=len(all_relevant_cases),
            similar_cases=len(similar_cases)
        )

        # Define compensating factor relationships to detect
        FACTOR_RELATIONSHIPS = [
            {
                "missing_doc": "tb_screening",
                "compensating_factors": ["severe", "high_crp", "fistula"],
                "description": "Disease severity can compensate for pending TB screening",
                "clinical_rationale": "Severe/urgent disease may warrant treatment initiation while TB screening is obtained"
            },
            {
                "missing_doc": "fecal_calprotectin",
                "compensating_factors": ["endoscopy_within_180_days", "colonoscopy_report"],
                "description": "Recent endoscopy can substitute for fecal calprotectin",
                "clinical_rationale": "Direct visualization of mucosal disease is more definitive than biomarkers"
            },
            {
                "missing_doc": "step_therapy",
                "compensating_factors": ["physician_attestation", "urgency_documentation", "step_therapy_exception_request"],
                "description": "Physician attestation with urgency can bypass step therapy requirements",
                "clinical_rationale": "Medical necessity exceptions exist for patients who cannot safely wait for standard sequencing"
            }
        ]

        for relationship in FACTOR_RELATIONSHIPS:
            missing_doc = relationship["missing_doc"]

            # Find cases with this documentation missing from ALL relevant cases
            cases_missing_doc = [
                c for c in all_relevant_cases
                if missing_doc in [d.lower() for d in c.get("documentation_missing", [])]
            ]

            if len(cases_missing_doc) < 3:
                continue  # Need minimum sample size

            # Analyze approval rates with/without compensating factors
            cases_with_compensation = []
            cases_without_compensation = []

            for case in cases_missing_doc:
                # case is now a raw dict from historical_data, not a SimilarCase object
                docs_present = set(d.lower() for d in case.get("documentation_present", []))
                severity = case.get("disease_severity", {})

                has_compensating_factor = False
                compensating_details = []

                for factor in relationship["compensating_factors"]:
                    # Check documentation-based factors
                    if factor in docs_present:
                        has_compensating_factor = True
                        compensating_details.append(factor)

                    # Check severity-based factors
                    if factor == "severe" and severity.get("severity_classification") == "severe":
                        has_compensating_factor = True
                        compensating_details.append("severity_classification=severe")

                    if factor == "high_crp" and severity.get("crp") and severity["crp"] > 15:
                        has_compensating_factor = True
                        compensating_details.append(f"CRP={severity['crp']}")

                    if factor == "fistula":
                        diagnosis = case.get("diagnosis", {})
                        if "fistula" in diagnosis.get("description", "").lower():
                            has_compensating_factor = True
                            compensating_details.append("fistulizing_disease")
                        if "imaging_with_fistula" in docs_present:
                            has_compensating_factor = True
                            compensating_details.append("imaging_with_fistula")

                if has_compensating_factor:
                    cases_with_compensation.append({
                        "case": case,
                        "factors": compensating_details
                    })
                else:
                    cases_without_compensation.append(case)

            # Calculate approval rates
            if len(cases_with_compensation) >= 2 and len(cases_without_compensation) >= 2:
                approval_with = sum(
                    1 for c in cases_with_compensation
                    if c["case"].get("outcome") == "approved"
                ) / len(cases_with_compensation)

                approval_without = sum(
                    1 for c in cases_without_compensation
                    if c.get("outcome") == "approved"
                ) / len(cases_without_compensation)

                # Only report if compensating factors make significant difference (>20%)
                if approval_with - approval_without >= 0.20:
                    # Check if current case has the missing doc
                    is_missing_in_current = missing_doc not in current_docs

                    # Check if current case has compensating factors
                    current_has_compensation = False
                    current_compensating_factors = []

                    for factor in relationship["compensating_factors"]:
                        if factor in current_docs:
                            current_has_compensation = True
                            current_compensating_factors.append(factor)

                        if current_severity:
                            if factor == "severe" and current_severity.get("severity_classification") == "severe":
                                current_has_compensation = True
                                current_compensating_factors.append("severe_disease")
                            if factor == "high_crp" and current_severity.get("crp") and current_severity["crp"] > 15:
                                current_has_compensation = True
                                current_compensating_factors.append(f"elevated_CRP")

                    # Generate actionable recommendation
                    if is_missing_in_current and current_has_compensation:
                        recommendation = (
                            f"Submit PA now despite missing {missing_doc.replace('_', ' ')}. "
                            f"Your compensating factors ({', '.join(current_compensating_factors)}) "
                            f"historically achieve {approval_with:.0%} approval in similar cases. "
                            f"Add a note emphasizing disease severity and clinical urgency."
                        )
                        priority = "high"
                    elif is_missing_in_current:
                        recommendation = (
                            f"Missing {missing_doc.replace('_', ' ')} reduces approval odds. "
                            f"Consider documenting disease severity more thoroughly as a compensating factor."
                        )
                        priority = "medium"
                    else:
                        recommendation = f"{missing_doc.replace('_', ' ')} is present - no compensation needed."
                        priority = "low"

                    approved_with = sum(1 for c in cases_with_compensation if c["case"].get("outcome") == "approved")
                    denied_with = sum(1 for c in cases_with_compensation if c["case"].get("outcome") == "denied")
                    info_req_with = len(cases_with_compensation) - approved_with - denied_with
                    approved_without = sum(1 for c in cases_without_compensation if c.get("outcome") == "approved")
                    denied_without = sum(1 for c in cases_without_compensation if c.get("outcome") == "denied")
                    info_req_without = len(cases_without_compensation) - approved_without - denied_without

                    sample_case_ids_with = [c["case"].get("case_id", "unknown") for c in cases_with_compensation[:5]]
                    sample_case_ids_without = [c.get("case_id", "unknown") for c in cases_without_compensation[:5]]

                    evidence = {
                        "total_cases_analyzed": len(all_relevant_cases),
                        "cases_missing_this_doc": len(cases_missing_doc),
                        "with_compensation": {
                            "total": len(cases_with_compensation),
                            "approved": approved_with,
                            "denied": denied_with,
                            "info_requested": info_req_with,
                            "sample_case_ids": sample_case_ids_with,
                        },
                        "without_compensation": {
                            "total": len(cases_without_compensation),
                            "approved": approved_without,
                            "denied": denied_without,
                            "info_requested": info_req_without,
                            "sample_case_ids": sample_case_ids_without,
                        },
                        "methodology": (
                            f"Analyzed {len(all_relevant_cases)} historical cases for {medication_name or 'this medication'}. "
                            f"Found {len(cases_missing_doc)} cases missing {missing_doc.replace('_', ' ')}. "
                            f"Of those, {len(cases_with_compensation)} had compensating factors and "
                            f"{len(cases_without_compensation)} did not. "
                            f"Approval rate with compensation: {approved_with}/{len(cases_with_compensation)} ({approval_with:.0%}). "
                            f"Approval rate without: {approved_without}/{len(cases_without_compensation)} ({approval_without:.0%})."
                        ),
                    }

                    compensating_patterns.append({
                        "pattern_type": "compensating_factor",
                        "missing_documentation": missing_doc,
                        "compensating_factors": relationship["compensating_factors"],
                        "approval_rate_with_compensation": round(approval_with, 3),
                        "approval_rate_without_compensation": round(approval_without, 3),
                        "approval_uplift": round(approval_with - approval_without, 3),
                        "cases_with_compensation": len(cases_with_compensation),
                        "cases_without_compensation": len(cases_without_compensation),
                        "description": relationship["description"],
                        "clinical_rationale": relationship["clinical_rationale"],
                        "is_missing_in_current_case": is_missing_in_current,
                        "current_case_has_compensation": current_has_compensation,
                        "current_compensating_factors": current_compensating_factors,
                        "recommendation": recommendation,
                        "priority": priority,
                        "evidence": evidence,
                    })

        # Also detect lab severity bundle pattern
        lab_bundle_cases = []
        non_bundle_cases = []

        for case in similar_cases:
            severity = case.case_data.get("disease_severity", {})
            crp = severity.get("crp", 0) or 0
            albumin = severity.get("albumin", 4.0) or 4.0
            esr = severity.get("esr", 0) or 0

            # Lab severity bundle: CRP > 20, albumin < 3.0, ESR > 40
            has_bundle = crp > 20 and albumin < 3.0 and esr > 40

            if has_bundle:
                lab_bundle_cases.append(case)
            else:
                non_bundle_cases.append(case)

        if len(lab_bundle_cases) >= 3 and len(non_bundle_cases) >= 3:
            bundle_approval = sum(
                1 for c in lab_bundle_cases if c.case_data.get("outcome") == "approved"
            ) / len(lab_bundle_cases)

            non_bundle_approval = sum(
                1 for c in non_bundle_cases if c.case_data.get("outcome") == "approved"
            ) / len(non_bundle_cases)

            if bundle_approval - non_bundle_approval >= 0.15:
                # Check current case for lab bundle
                current_has_bundle = False
                if current_severity:
                    c_crp = current_severity.get("crp", 0) or 0
                    c_alb = current_severity.get("albumin", 4.0) or 4.0
                    c_esr = current_severity.get("esr", 0) or 0
                    current_has_bundle = c_crp > 20 and c_alb < 3.0 and c_esr > 40

                if current_has_bundle:
                    recommendation = (
                        f"Strong approval signal: Your patient's lab severity bundle "
                        f"(CRP>20, albumin<3.0, ESR>40) achieves {bundle_approval:.0%} approval rate. "
                        f"Emphasize these markers in the PA submission."
                    )
                    priority = "high"
                else:
                    recommendation = (
                        f"Lab severity bundle (CRP>20, albumin<3.0, ESR>40) shows {bundle_approval:.0%} approval. "
                        f"Document all available inflammatory markers prominently."
                    )
                    priority = "medium"

                bundle_approved = sum(1 for c in lab_bundle_cases if c.case_data.get("outcome") == "approved")
                bundle_denied = sum(1 for c in lab_bundle_cases if c.case_data.get("outcome") == "denied")
                bundle_info = len(lab_bundle_cases) - bundle_approved - bundle_denied
                non_bundle_approved = sum(1 for c in non_bundle_cases if c.case_data.get("outcome") == "approved")
                non_bundle_denied = sum(1 for c in non_bundle_cases if c.case_data.get("outcome") == "denied")
                non_bundle_info = len(non_bundle_cases) - non_bundle_approved - non_bundle_denied

                bundle_evidence = {
                    "total_cases_analyzed": len(similar_cases),
                    "with_compensation": {
                        "total": len(lab_bundle_cases),
                        "approved": bundle_approved,
                        "denied": bundle_denied,
                        "info_requested": bundle_info,
                        "sample_case_ids": [c.case_id for c in lab_bundle_cases[:5]],
                    },
                    "without_compensation": {
                        "total": len(non_bundle_cases),
                        "approved": non_bundle_approved,
                        "denied": non_bundle_denied,
                        "info_requested": non_bundle_info,
                        "sample_case_ids": [c.case_id for c in non_bundle_cases[:5]],
                    },
                    "methodology": (
                        f"Analyzed {len(similar_cases)} similar cases. "
                        f"{len(lab_bundle_cases)} had lab severity bundle (CRP>20, albumin<3.0, ESR>40): "
                        f"{bundle_approved} approved, {bundle_denied} denied, {bundle_info} info requested. "
                        f"{len(non_bundle_cases)} without bundle: "
                        f"{non_bundle_approved} approved, {non_bundle_denied} denied, {non_bundle_info} info requested."
                    ),
                }

                compensating_patterns.append({
                    "pattern_type": "lab_severity_bundle",
                    "description": "Elevated inflammatory markers create approval-favorable severity signal",
                    "clinical_rationale": "Multiple elevated markers indicate active, severe disease requiring urgent treatment",
                    "bundle_criteria": {"crp": ">20", "albumin": "<3.0", "esr": ">40"},
                    "approval_rate_with_bundle": round(bundle_approval, 3),
                    "approval_rate_without_bundle": round(non_bundle_approval, 3),
                    "approval_uplift": round(bundle_approval - non_bundle_approval, 3),
                    "cases_with_bundle": len(lab_bundle_cases),
                    "cases_without_bundle": len(non_bundle_cases),
                    "current_case_has_bundle": current_has_bundle,
                    "recommendation": recommendation,
                    "priority": priority,
                    "evidence": bundle_evidence,
                })

        # Sort by approval uplift (most impactful first)
        compensating_patterns.sort(key=lambda x: x.get("approval_uplift", 0), reverse=True)

        logger.info(
            "Analyzed compensating factors",
            patterns_found=len(compensating_patterns),
            high_priority=[p["pattern_type"] for p in compensating_patterns if p.get("priority") == "high"]
        )

        return compensating_patterns

    @staticmethod
    def _wilson_interval(successes: int, total: int, z: float = 1.96) -> Tuple[float, float]:
        """
        Calculate Wilson score confidence interval for a proportion.

        This is preferred over the normal approximation for small samples
        because it never produces negative lower bounds or bounds > 1.

        Args:
            successes: Number of successes (e.g. approvals)
            total: Total sample size
            z: Z-score for confidence level (1.96 = 95% CI)

        Returns:
            Tuple of (lower_bound, upper_bound) as proportions in [0, 1]
        """
        if total == 0:
            return (0.0, 0.0)
        p = successes / total
        denominator = 1 + z ** 2 / total
        center = (p + z ** 2 / (2 * total)) / denominator
        margin = z * math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total) / denominator
        return (max(0.0, center - margin), min(1.0, center + margin))

    def _validate_statistical_claims(self, insights: StrategicInsights, sample_size: int) -> StrategicInsights:
        """
        Add statistical rigor annotations to insights based on sample size.

        Applies Wilson score confidence intervals to all proportion claims
        and flags low-sample-size warnings so downstream consumers (UI, LLM
        prompts) can display appropriate caveats.

        Args:
            insights: The StrategicInsights object to annotate
            sample_size: Number of similar cases the insights are based on

        Returns:
            The same StrategicInsights object, mutated with statistical metadata
        """
        warnings: List[str] = []

        # --- Determine statistical_validity tier ---
        if sample_size >= 30:
            validity = "reliable"
        elif sample_size >= 20:
            validity = "moderate"
        elif sample_size >= 10:
            validity = "low"
        else:
            validity = "insufficient"

        insights.statistical_validity = validity

        # --- LOW_SAMPLE_SIZE warning for n < 10 ---
        if sample_size < 10:
            warnings.append(
                f"LOW_SAMPLE_SIZE: Only {sample_size} similar cases found. "
                f"All pattern claims should be treated as preliminary signals, not established trends."
            )

        # --- LOW_CONFIDENCE flag for n < 20 ---
        if sample_size < 20:
            warnings.append(
                f"LOW_CONFIDENCE: Sample size ({sample_size}) is below 20. "
                f"Quantified patterns (approval rates, percentages) have wide confidence intervals."
            )

        # --- Add confidence intervals to top-level rates ---
        # Compute approved/denied counts from the rates and sample_size
        approved_count = round(insights.approval_rate_for_similar * sample_size)
        denied_count = round(insights.denial_rate_for_similar * sample_size)
        info_request_count = round(insights.info_request_rate_for_similar * sample_size)

        approval_ci = self._wilson_interval(approved_count, sample_size)
        denial_ci = self._wilson_interval(denied_count, sample_size)
        info_request_ci = self._wilson_interval(info_request_count, sample_size)

        if not insights.evidence_summary:
            insights.evidence_summary = {}

        insights.evidence_summary["confidence_intervals"] = {
            "confidence_level": "95%",
            "method": "wilson_score",
            "sample_size": sample_size,
            "approval_rate": {
                "point_estimate": round(insights.approval_rate_for_similar, 3),
                "ci_lower": round(approval_ci[0], 3),
                "ci_upper": round(approval_ci[1], 3),
            },
            "denial_rate": {
                "point_estimate": round(insights.denial_rate_for_similar, 3),
                "ci_lower": round(denial_ci[0], 3),
                "ci_upper": round(denial_ci[1], 3),
            },
            "info_request_rate": {
                "point_estimate": round(insights.info_request_rate_for_similar, 3),
                "ci_lower": round(info_request_ci[0], 3),
                "ci_upper": round(info_request_ci[1], 3),
            },
        }

        # --- Annotate documentation insights with confidence intervals ---
        for doc_insight in insights.documentation_insights:
            if isinstance(doc_insight, dict):
                # Add CI to impact_on_approval if present
                impact = doc_insight.get("impact_on_approval")
                cases_with = doc_insight.get("cases_with", 0)
                cases_without = doc_insight.get("cases_without", 0)
                approval_rate_with = doc_insight.get("approval_rate_with")
                approval_rate_without = doc_insight.get("approval_rate_without")

                if approval_rate_with is not None and cases_with > 0:
                    successes_with = round(approval_rate_with * cases_with)
                    ci_with = self._wilson_interval(successes_with, cases_with)
                    doc_insight["approval_rate_with_ci"] = {
                        "lower": round(ci_with[0], 3),
                        "upper": round(ci_with[1], 3),
                    }

                if approval_rate_without is not None and cases_without > 0:
                    successes_without = round(approval_rate_without * cases_without)
                    ci_without = self._wilson_interval(successes_without, cases_without)
                    doc_insight["approval_rate_without_ci"] = {
                        "lower": round(ci_without[0], 3),
                        "upper": round(ci_without[1], 3),
                    }

                # Flag low-sample doc patterns
                total_doc_cases = cases_with + cases_without
                if total_doc_cases < 10:
                    doc_insight["statistical_warning"] = "LOW_SAMPLE_SIZE"
                elif total_doc_cases < 20:
                    doc_insight["statistical_warning"] = "LOW_CONFIDENCE"

        # --- Annotate compensating factors with confidence intervals ---
        for factor in insights.compensating_factors:
            if isinstance(factor, dict):
                n_with = factor.get("cases_with_compensation", 0)
                n_without = factor.get("cases_without_compensation", 0)
                rate_with = factor.get("approval_rate_with_compensation")
                rate_without = factor.get("approval_rate_without_compensation")

                if rate_with is not None and n_with > 0:
                    successes = round(rate_with * n_with)
                    ci = self._wilson_interval(successes, n_with)
                    factor["approval_with_ci"] = {
                        "lower": round(ci[0], 3),
                        "upper": round(ci[1], 3),
                    }

                if rate_without is not None and n_without > 0:
                    successes = round(rate_without * n_without)
                    ci = self._wilson_interval(successes, n_without)
                    factor["approval_without_ci"] = {
                        "lower": round(ci[0], 3),
                        "upper": round(ci[1], 3),
                    }

                # Flag low-sample compensating patterns
                total_factor_cases = n_with + n_without
                if total_factor_cases < 10:
                    factor["statistical_warning"] = "LOW_SAMPLE_SIZE"
                elif total_factor_cases < 20:
                    factor["statistical_warning"] = "LOW_CONFIDENCE"

        # --- Annotate agentic insights ---
        for agentic in insights.agentic_insights:
            if isinstance(agentic, dict) and sample_size < 10:
                agentic["statistical_warning"] = "LOW_SAMPLE_SIZE"
            elif isinstance(agentic, dict) and sample_size < 20:
                agentic["statistical_warning"] = "LOW_CONFIDENCE"

        insights.statistical_warnings = warnings

        logger.info(
            "Statistical validation applied",
            sample_size=sample_size,
            validity=validity,
            warnings_count=len(warnings),
        )

        return insights

    async def generate_strategic_intelligence(
        self,
        case_data: Dict[str, Any],
        patient_data: Dict[str, Any],
        skip_cache: bool = False
    ) -> StrategicInsights:
        """
        Generate comprehensive strategic intelligence for a PA case.

        Results are cached for performance. Use skip_cache=True to force regeneration.

        Args:
            case_data: Current case state data
            patient_data: Patient information
            skip_cache: If True, bypass cache and regenerate (default: False)

        Returns:
            StrategicInsights with recommendations and analysis
        """
        case_id = case_data.get("case_id", "unknown")
        logger.info("Generating strategic intelligence", case_id=case_id, skip_cache=skip_cache)

        # Extract key information from case
        medication_name = self._extract_medication_name(case_data, patient_data)
        icd10_code = self._extract_icd10_code(case_data, patient_data)
        payer_name = self._extract_payer_name(case_data, patient_data)
        disease_severity = self._extract_disease_severity(patient_data, case_data)
        prior_treatments = self._extract_prior_treatments(patient_data)
        current_documentation = self._extract_current_documentation(case_data, patient_data)

        # Generate cache key based on similarity parameters (NOT case_id)
        # This allows different cases with same medication/payer/diagnosis to share cache
        cache_key_hash = self._generate_cache_key(
            medication_name=medication_name,
            icd10_code=icd10_code,
            payer_name=payer_name,
            disease_severity=disease_severity
        )

        # Check cache (unless skip_cache is True)
        if not skip_cache:
            cached_data = await self._get_cached_intelligence(cache_key_hash)
            if cached_data:
                logger.info(
                    "Returning cached strategic intelligence",
                    case_id=case_id,
                    cache_key=cache_key_hash[:16]
                )
                return self._dict_to_insights(cached_data)

        # Cache miss or skip_cache - generate fresh intelligence
        # Find similar cases
        similar_cases = self.find_similar_cases(
            medication_name=medication_name,
            icd10_code=icd10_code,
            payer_name=payer_name,
            disease_severity=disease_severity,
            prior_treatments=prior_treatments,
            min_similarity=0.4,
            max_results=50,
        )

        # Analyze patterns (including compensating factors)
        pattern_analysis = self.analyze_patterns(
            similar_cases=similar_cases,
            payer_name=payer_name,
            current_documentation=current_documentation,
            current_severity=disease_severity,
            medication_name=medication_name
        )

        # Build cohort summary from the same pool (matches cohort analysis denominator)
        approved_cases = [c for c in similar_cases if c.case_data.get("outcome") == "approved"]
        denied_cases = [c for c in similar_cases if c.case_data.get("outcome") == "denied"]
        info_requested_cases = [c for c in similar_cases if c.case_data.get("outcome") == "info_request"]
        cohort_summary = {
            "total_similar_cases": len(approved_cases) + len(denied_cases),
            "approved_count": len(approved_cases),
            "denied_count": len(denied_cases),
            "info_request_count": len(info_requested_cases),
            "total_historical_cases": len(self.historical_cases),
        }

        # Use LLM to synthesize insights
        insights = await self._synthesize_insights_with_llm(
            case_data=case_data,
            patient_data=patient_data,
            similar_cases=similar_cases,
            pattern_analysis=pattern_analysis,
            payer_name=payer_name,
            current_documentation=current_documentation
        )

        # Assess patient position against cohort patterns
        current_patient_profile = {
            "medication": medication_name,
            "payer": payer_name,
            "icd10_code": icd10_code,
            "disease_severity": disease_severity,
            "prior_treatments": prior_treatments,
            "documentation_present": current_documentation,
        }
        patient_position = await self._assess_patient_position(
            current_patient_profile=current_patient_profile,
            insights=pattern_analysis.get("documentation_patterns", []),
            medication_name=medication_name,
            payer_name=payer_name,
        )

        # Attach cohort_summary and patient_position to the insights object
        insights.cohort_summary = cohort_summary
        insights.patient_position = patient_position

        # Validate statistical claims and add confidence intervals
        insights = self._validate_statistical_claims(insights, sample_size=len(similar_cases))

        # Cache the results
        await self._set_cached_intelligence(
            case_id=case_id,
            cache_key_hash=cache_key_hash,
            medication_name=medication_name,
            icd10_code=icd10_code,
            payer_name=payer_name,
            insights=insights
        )

        logger.info(
            "Strategic intelligence generated and cached",
            case_id=case_id,
            similar_cases=len(similar_cases),
            confidence=insights.confidence_score
        )

        return insights

    def _dict_to_insights(self, data: Dict[str, Any]) -> StrategicInsights:
        """Convert cached dictionary back to StrategicInsights object."""
        similar_cases = data.get("similar_cases", {})
        return StrategicInsights(
            similar_cases_count=similar_cases.get("count", 0),
            approval_rate_for_similar=similar_cases.get("approval_rate", 0.0),
            denial_rate_for_similar=similar_cases.get("denial_rate", 0.0),
            info_request_rate_for_similar=similar_cases.get("info_request_rate", 0.0),
            avg_days_to_decision=similar_cases.get("avg_days_to_decision", 7.0),
            documentation_insights=data.get("documentation_insights", []),
            payer_insights=data.get("payer_insights", {}),
            timing_recommendations=data.get("timing_recommendations", {}),
            risk_factors=data.get("risk_factors", []),
            recommended_actions=data.get("recommended_actions", []),
            counterfactual_scenarios=data.get("counterfactual_scenarios", []),
            reasoning_chain=data.get("reasoning_chain", []),
            confidence_score=data.get("confidence_score", 0.5),
            confidence_reasoning=data.get("confidence_reasoning", "Restored from cache"),
            compensating_factors=data.get("compensating_factors", []),
            agentic_insights=data.get("agentic_insights", []),
            evidence_summary=data.get("evidence_summary", {}),
            cohort_summary=data.get("cohort_summary"),
            patient_position=data.get("patient_position"),
            statistical_validity=data.get("statistical_validity"),
            statistical_warnings=data.get("statistical_warnings", []),
        )

    def _extract_medication_name(
        self,
        case_data: Dict[str, Any],
        patient_data: Dict[str, Any]
    ) -> str:
        """Extract medication name from case or patient data."""
        # Try case data first
        medication = case_data.get("medication", {})
        if isinstance(medication, dict):
            if medication.get("medication_name"):
                return medication["medication_name"]

        # Try patient data
        med_request = patient_data.get("medication_request", {})
        if med_request.get("medication_name"):
            return med_request["medication_name"]

        return "unknown"

    def _extract_icd10_code(
        self,
        case_data: Dict[str, Any],
        patient_data: Dict[str, Any]
    ) -> str:
        """Extract primary ICD-10 code."""
        # Try case data
        medication = case_data.get("medication", {})
        if isinstance(medication, dict) and medication.get("icd10_code"):
            return medication["icd10_code"]

        # Try patient diagnoses
        diagnoses = patient_data.get("diagnoses", [])
        for dx in diagnoses:
            if dx.get("rank") == "primary":
                return dx.get("icd10_code", "")

        # Return first diagnosis if no primary
        if diagnoses:
            return diagnoses[0].get("icd10_code", "")

        return ""

    def _extract_payer_name(
        self,
        case_data: Dict[str, Any],
        patient_data: Dict[str, Any]
    ) -> str:
        """Extract payer name."""
        # Try case payer states
        payer_states = case_data.get("payer_states", {})
        if payer_states:
            return list(payer_states.keys())[0]

        # Try patient insurance
        insurance = patient_data.get("insurance", {})
        primary = insurance.get("primary", {})
        if primary.get("payer_name"):
            return primary["payer_name"]

        return "unknown"

    def _extract_disease_severity(
        self,
        patient_data: Dict[str, Any],
        case_data: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Extract disease severity metrics from patient and case data."""
        severity = {}

        disease_activity = patient_data.get("disease_activity", {})

        if disease_activity:
            severity["cdai_score"] = disease_activity.get("cdai_score")
            severity["hbi_score"] = disease_activity.get("hbi_score") or disease_activity.get("harvey_bradshaw_index")
            severity["ses_cd_score"] = disease_activity.get("ses_cd_score")
            severity["severity_classification"] = disease_activity.get("severity_classification") or disease_activity.get("disease_severity")
            severity["disease_phenotype"] = disease_activity.get("disease_phenotype")

        # Extract from case data medication supporting_labs
        if case_data:
            medication = case_data.get("medication", {})
            supporting_labs = medication.get("supporting_labs", {})
            panels = supporting_labs.get("panels", {})

            # Extract CRP from inflammatory markers
            inflammatory = panels.get("inflammatory_markers", {})
            for result in inflammatory.get("results", []):
                if result.get("test") == "CRP":
                    try:
                        crp_value = result.get("value")
                        if isinstance(crp_value, (int, float)):
                            severity["crp"] = crp_value
                        elif isinstance(crp_value, str):
                            # Handle values like ">100"
                            crp_value = crp_value.replace(">", "").replace("<", "")
                            severity["crp"] = float(crp_value)
                    except (ValueError, TypeError):
                        pass
                elif result.get("test") == "ESR":
                    try:
                        esr_value = result.get("value")
                        if isinstance(esr_value, (int, float)):
                            severity["esr"] = esr_value
                    except (ValueError, TypeError):
                        pass

            # Extract albumin from CMP
            cmp = panels.get("cmp", {})
            for result in cmp.get("results", []):
                if result.get("test") == "Albumin":
                    try:
                        albumin_value = result.get("value")
                        if isinstance(albumin_value, (int, float)):
                            severity["albumin"] = albumin_value
                    except (ValueError, TypeError):
                        pass

            # Check diagnosis for fistula
            diagnosis = medication.get("diagnosis", "")
            if "fistula" in diagnosis.lower():
                severity["fistula_present"] = True

            # Infer severity classification from CRP if not already set
            if "severity_classification" not in severity and "crp" in severity:
                if severity["crp"] > 20:
                    severity["severity_classification"] = "severe"
                elif severity["crp"] > 10:
                    severity["severity_classification"] = "moderate"
                else:
                    severity["severity_classification"] = "mild"

        # Also check top-level laboratory_results.panels (patient JSON format)
        # Fill in any lab values not already extracted from case_data
        panels = patient_data.get("laboratory_results", {}).get("panels", {})
        if panels:
            if "crp" not in severity:
                for result in panels.get("inflammatory_markers", {}).get("results", []):
                    if result.get("test") == "CRP":
                        try:
                            v = result.get("value")
                            severity["crp"] = float(str(v).replace(">", "").replace("<", "")) if v else None
                        except (ValueError, TypeError):
                            pass
                    elif result.get("test") == "ESR" and "esr" not in severity:
                        try:
                            severity["esr"] = float(result["value"])
                        except (ValueError, TypeError):
                            pass
            if "albumin" not in severity:
                for result in panels.get("cmp", {}).get("results", []):
                    if result.get("test") == "Albumin":
                        try:
                            severity["albumin"] = float(result["value"])
                        except (ValueError, TypeError):
                            pass
            # Fecal calprotectin
            for result in panels.get("gi_markers", {}).get("results", []):
                if "calprotectin" in result.get("test", "").lower():
                    try:
                        severity["fecal_calprotectin"] = float(result["value"])
                    except (ValueError, TypeError):
                        pass

        # Check top-level diagnoses for fistula
        if "fistula_present" not in severity:
            for dx in patient_data.get("diagnoses", []):
                if "fistula" in dx.get("description", "").lower():
                    severity["fistula_present"] = True
                    break

        # Clean out None values
        severity = {k: v for k, v in severity.items() if v is not None}

        return severity if severity else None

    def _extract_prior_treatments(
        self,
        patient_data: Dict[str, Any]
    ) -> Optional[List[Dict[str, Any]]]:
        """Extract prior treatment history."""
        prior_treatments = patient_data.get("prior_treatments", [])
        if prior_treatments:
            return [
                {
                    "medication": t.get("medication_name", ""),
                    "drug_class": t.get("drug_class", ""),
                    "outcome": t.get("outcome", ""),
                    "duration_weeks": t.get("duration_weeks"),
                    "outcome_description": t.get("outcome_description", ""),
                }
                for t in prior_treatments
            ]

        return None

    def _extract_current_documentation(
        self,
        case_data: Dict[str, Any],
        patient_data: Dict[str, Any]
    ) -> List[str]:
        """Extract list of current documentation."""
        docs = []

        # From extraction metadata
        metadata = patient_data.get("extraction_metadata", {})
        extracted_from = metadata.get("extracted_from", [])
        for doc in extracted_from:
            # Normalize document names
            doc_lower = doc.lower()
            if "lab" in doc_lower:
                docs.append("laboratory_results")
            if "colonoscopy" in doc_lower:
                docs.append("colonoscopy_report")
            if "prior_auth" in doc_lower:
                docs.append("prior_auth_form")
            if "clinical" in doc_lower:
                docs.append("clinical_summary")
            if "mri" in doc_lower or "imaging" in doc_lower:
                docs.append("imaging_results")

        # From laboratory_results.panels
        panels = patient_data.get("laboratory_results", {}).get("panels", {})
        gi_markers = panels.get("gi_markers", {}).get("results", [])
        for result in gi_markers:
            if "calprotectin" in result.get("test", "").lower():
                docs.append("fecal_calprotectin")
                break

        # From pre_biologic_screening status
        screening = patient_data.get("pre_biologic_screening", {})
        tb = screening.get("tuberculosis_screening", {})
        if tb.get("documentation_available") or tb.get("status") == "COMPLETED":
            docs.append("tb_screening")
        hep_b = screening.get("hepatitis_b_screening", {})
        if hep_b.get("documentation_available") or hep_b.get("status") == "COMPLETED":
            docs.append("hepatitis_panel")

        return list(set(docs))

    # ── Cohort Similarity Analysis ──────────────────────────────────────

    def _generate_cohort_cache_key(
        self,
        medication_name: str,
        icd10_code: str,
        payer_name: str,
    ) -> str:
        """Generate cache key for cohort analysis (no severity — intentionally broad)."""
        key_parts = [
            medication_name.lower().strip(),
            icd10_code[:3].upper() if icd10_code else "",
            payer_name.lower().strip(),
        ]
        key_string = "::".join(key_parts)
        return hashlib.sha256(key_string.encode()).hexdigest()

    async def _get_cached_cohort_analysis(self, cache_key_hash: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached cohort analysis if available and not expired."""
        try:
            async with get_db() as db:
                stmt = select(CohortAnalysisCacheModel).where(
                    CohortAnalysisCacheModel.cache_key_hash == cache_key_hash
                )
                result = await db.execute(stmt)
                cache_entry = result.scalar_one_or_none()

                if cache_entry is None:
                    return None

                # Cache never expires — manual invalidation only
                # if cache_entry.is_expired():
                #     ...

                logger.info("Cohort analysis cache hit", cache_key_hash=cache_key_hash[:16])
                return cache_entry.analysis_data
        except Exception as e:
            logger.warning("Cohort cache retrieval error", error=str(e))
            return None

    async def _set_cached_cohort_analysis(
        self,
        cache_key_hash: str,
        medication_name: str,
        icd10_family: str,
        payer_name: str,
        analysis_data: Dict[str, Any],
        approved_count: int,
        denied_count: int,
        total_count: int,
    ) -> None:
        """Store cohort analysis in cache."""
        try:
            async with get_db() as db:
                await db.execute(
                    delete(CohortAnalysisCacheModel).where(
                        CohortAnalysisCacheModel.cache_key_hash == cache_key_hash
                    )
                )
                cache_entry = CohortAnalysisCacheModel(
                    id=str(uuid.uuid4()),
                    cache_key_hash=cache_key_hash,
                    medication_name=medication_name,
                    icd10_family=icd10_family,
                    payer_name=payer_name,
                    cached_at=datetime.now(timezone.utc),
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=self.cache_ttl_hours),
                    analysis_data=analysis_data,
                    approved_cohort_size=approved_count,
                    denied_cohort_size=denied_count,
                    total_similar_cases=total_count,
                )
                db.add(cache_entry)
                await db.commit()
                logger.info("Cached cohort analysis", cache_key_hash=cache_key_hash[:16])
        except Exception as e:
            logger.warning("Cohort cache storage error", error=str(e))

    def _build_cohort_comparison(
        self,
        approved_cases: List[SimilarCase],
        denied_cases: List[SimilarCase],
    ) -> Dict[str, Any]:
        """Build statistical comparison between approved and denied cohorts."""

        def _cohort_stats(cases: List[SimilarCase]) -> Dict[str, Any]:
            if not cases:
                return {"count": 0}

            severities = []
            crp_values = []
            esr_values = []
            albumin_values = []
            days_to_decision = []
            doc_presence: Dict[str, int] = {}
            severity_classes: Dict[str, int] = {}
            prior_treatment_counts = []

            for c in cases:
                data = c.case_data
                severity = data.get("disease_severity", {})

                if severity.get("cdai_score"):
                    severities.append(severity["cdai_score"])
                if severity.get("crp"):
                    crp_values.append(severity["crp"])
                if severity.get("esr"):
                    esr_values.append(severity["esr"])
                if severity.get("albumin"):
                    albumin_values.append(severity["albumin"])
                if severity.get("severity_classification"):
                    cls = severity["severity_classification"]
                    severity_classes[cls] = severity_classes.get(cls, 0) + 1

                if data.get("days_to_decision"):
                    days_to_decision.append(data["days_to_decision"])

                for doc in data.get("documentation_present", []):
                    doc_presence[doc.lower()] = doc_presence.get(doc.lower(), 0) + 1

                prior = data.get("prior_treatments", [])
                prior_treatment_counts.append(len(prior))

            count = len(cases)

            def avg(vals):
                return round(sum(vals) / len(vals), 2) if vals else None

            def pct(vals, threshold, op='gt'):
                if not vals:
                    return None
                if op == 'gt':
                    return round(sum(1 for v in vals if v > threshold) / len(vals), 3)
                return round(sum(1 for v in vals if v < threshold) / len(vals), 3)

            return {
                "count": count,
                "severity_distribution": severity_classes,
                "cdai": {"avg": avg(severities), "values": sorted(severities)} if severities else None,
                "crp": {
                    "avg": avg(crp_values),
                    "pct_above_10": pct(crp_values, 10),
                    "pct_above_18": pct(crp_values, 18),
                    "pct_above_25": pct(crp_values, 25),
                } if crp_values else None,
                "esr": {"avg": avg(esr_values), "pct_above_30": pct(esr_values, 30), "pct_above_40": pct(esr_values, 40)} if esr_values else None,
                "albumin": {"avg": avg(albumin_values), "pct_below_3": pct(albumin_values, 3, 'lt'), "pct_below_3_5": pct(albumin_values, 3.5, 'lt')} if albumin_values else None,
                "avg_days_to_decision": avg(days_to_decision),
                "documentation_rates": {doc: round(cnt / count, 3) for doc, cnt in sorted(doc_presence.items(), key=lambda x: -x[1])},
                "avg_prior_treatments": avg(prior_treatment_counts),
            }

        approved_stats = _cohort_stats(approved_cases)
        denied_stats = _cohort_stats(denied_cases)

        # Compute differential metrics
        differential = {}
        for metric in ["crp", "esr", "albumin"]:
            a = approved_stats.get(metric)
            d = denied_stats.get(metric)
            if a and d and a.get("avg") is not None and d.get("avg") is not None:
                differential[f"{metric}_avg_diff"] = round(a["avg"] - d["avg"], 2)

        # Documentation rate differentials
        all_docs = set(list(approved_stats.get("documentation_rates", {}).keys()) + list(denied_stats.get("documentation_rates", {}).keys()))
        doc_diffs = {}
        for doc in all_docs:
            a_rate = approved_stats.get("documentation_rates", {}).get(doc, 0)
            d_rate = denied_stats.get("documentation_rates", {}).get(doc, 0)
            diff = round(a_rate - d_rate, 3)
            if abs(diff) > 0.1:
                doc_diffs[doc] = {"approved_rate": a_rate, "denied_rate": d_rate, "diff": diff}
        differential["documentation_diffs"] = doc_diffs

        if approved_stats.get("avg_prior_treatments") and denied_stats.get("avg_prior_treatments"):
            differential["prior_treatment_diff"] = round(
                approved_stats["avg_prior_treatments"] - denied_stats["avg_prior_treatments"], 2
            )

        return {
            "approved_stats": approved_stats,
            "denied_stats": denied_stats,
            "differential": differential,
        }

    async def _synthesize_cohort_differentiators(
        self,
        comparison: Dict[str, Any],
        current_patient_profile: Dict[str, Any],
        medication_name: str,
        payer_name: str,
        icd10_family: str,
    ) -> Dict[str, Any]:
        """Use Claude to discover non-obvious differentiators between approved and denied cohorts."""
        total = comparison["approved_stats"]["count"] + comparison["denied_stats"]["count"]

        prompt = self.prompt_loader.load(
            "strategy/cohort_differentiator_analysis.txt",
            {
                "total_similar_cases": str(total),
                "medication_name": medication_name,
                "payer_name": payer_name,
                "icd10_family": icd10_family,
                "approved_count": str(comparison["approved_stats"]["count"]),
                "denied_count": str(comparison["denied_stats"]["count"]),
                "current_patient_profile": json.dumps(current_patient_profile, indent=2),
                "approved_cohort_stats": json.dumps(comparison["approved_stats"], indent=2),
                "denied_cohort_stats": json.dumps(comparison["denied_stats"], indent=2),
                "differential_metrics": json.dumps(comparison["differential"], indent=2),
            }
        )

        result = await self.llm_gateway.generate(
            task_category=TaskCategory.POLICY_REASONING,
            prompt=prompt,
            temperature=0.2,
            response_format="json",
        )

        # Claude client with response_format="json" returns parsed dict directly
        # (not wrapped in a "response" key). Strip gateway metadata before returning.
        insights = {k: v for k, v in result.items() if k not in ("provider", "task_category")}

        expected_keys = {"differentiating_insights", "documentation_differentiators", "actionable_recommendations", "current_patient_position"}
        found_keys = set(insights.keys()) & expected_keys
        logger.info("Cohort LLM response", found_keys=list(found_keys), all_keys=list(insights.keys()))

        if not found_keys:
            logger.warning("Cohort LLM returned no expected insight keys", keys=list(insights.keys()))
            return {
                "_parse_failed": True,
                "differentiating_insights": [],
                "documentation_differentiators": [],
                "actionable_recommendations": [],
                "current_patient_position": {
                    "favorable_factors": [],
                    "at_risk_factors": [],
                    "overall_summary": "Analysis completed but structured output could not be parsed. Raw cohort statistics are still available.",
                    "estimated_cohort_match": 0.0,
                },
            }

        return insights

    async def _assess_patient_position(
        self,
        current_patient_profile: Dict[str, Any],
        insights: List[Dict[str, Any]],
        medication_name: str,
        payer_name: str,
    ) -> Dict[str, Any]:
        """Assess current patient's position against cached cohort insights via LLM."""
        from backend.reasoning.prompt_loader import get_prompt_loader
        prompt = get_prompt_loader().load(
            "strategy/patient_position_assessment.txt",
            {
                "medication_name": medication_name,
                "payer_name": payer_name,
                "current_patient_profile": json.dumps(current_patient_profile, indent=2),
                "insights": json.dumps(insights, indent=2),
            },
        )
        try:
            result = await self.llm_gateway.generate(
                task_category=TaskCategory.POLICY_REASONING,
                prompt=prompt,
                temperature=0.1,
                response_format="json",
            )
            response_text = result.get("response", "{}")
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            return json.loads(response_text)
        except Exception as e:
            logger.warning("Failed to assess patient position", error=str(e))
            return {
                "favorable_factors": [],
                "at_risk_factors": [],
                "overall_summary": "Unable to assess patient position against cohort data.",
                "estimated_cohort_match": 0.0,
            }

    async def generate_cohort_analysis(
        self,
        case_data: Dict[str, Any],
        patient_data: Dict[str, Any],
        skip_cache: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate cohort similarity analysis comparing approved vs denied cases.

        Finds clinically similar historical cases, splits by outcome, and uses
        Claude to discover non-obvious differentiating factors.

        Cache stores cohort-level data only. Patient-specific position assessment
        is regenerated on each call using a lightweight LLM pass.
        """
        case_id = case_data.get("case_id", "unknown")
        logger.info("Generating cohort analysis", case_id=case_id)

        medication_name = self._extract_medication_name(case_data, patient_data)
        icd10_code = self._extract_icd10_code(case_data, patient_data)
        payer_name = self._extract_payer_name(case_data, patient_data)
        disease_severity = self._extract_disease_severity(patient_data, case_data)
        prior_treatments = self._extract_prior_treatments(patient_data)
        current_documentation = self._extract_current_documentation(case_data, patient_data)
        icd10_family = icd10_code[:3] if icd10_code else ""

        # Build current patient profile (used for patient-specific assessment)
        current_patient_profile = {
            "medication": medication_name,
            "payer": payer_name,
            "icd10_code": icd10_code,
            "disease_severity": disease_severity,
            "prior_treatments": prior_treatments,
            "documentation_present": current_documentation,
        }

        # Cache key: medication + icd10_family + payer (no severity — intentionally broad)
        cache_key = self._generate_cohort_cache_key(medication_name, icd10_code, payer_name)

        if not skip_cache:
            cached = await self._get_cached_cohort_analysis(cache_key)
            if cached:
                logger.info("Cache hit — regenerating patient position", case_id=case_id)
                # Re-assess current patient against cached cohort insights
                patient_position = await self._assess_patient_position(
                    current_patient_profile=current_patient_profile,
                    insights=cached.get("differentiating_insights", []),
                    medication_name=medication_name,
                    payer_name=payer_name,
                )
                cached["current_patient_position"] = patient_position
                cached["_from_cache"] = True
                return cached

        # Find similar cases with lower threshold to get broader cohort
        similar_cases = self.find_similar_cases(
            medication_name=medication_name,
            icd10_code=icd10_code,
            payer_name=payer_name,
            disease_severity=disease_severity,
            prior_treatments=prior_treatments,
            min_similarity=0.4,
            max_results=50,
        )

        # Split into approved / denied cohorts (exclude info_request from counts)
        approved = [c for c in similar_cases if c.case_data.get("outcome") == "approved"]
        denied = [c for c in similar_cases if c.case_data.get("outcome") == "denied"]
        info_request_count = len([c for c in similar_cases if c.case_data.get("outcome") == "info_request"])

        if len(approved) < 2 or len(denied) < 2:
            return {
                "status": "insufficient_data",
                "message": f"Need at least 2 approved and 2 denied cases. Found {len(approved)} approved, {len(denied)} denied.",
                "total_similar_cases": len(approved) + len(denied),
                "approved_count": len(approved),
                "denied_count": len(denied),
                "info_request_count": info_request_count,
            }

        # Aggregate denial reasons and info-request reasons from the cohort
        denial_reason_counts: Dict[str, int] = {}
        appeal_stats = {"total_appeals": 0, "successful_appeals": 0}
        info_request_reasons: Dict[str, int] = {}
        for case in denied:
            reason = case.case_data.get("denial_reason")
            if reason:
                denial_reason_counts[reason] = denial_reason_counts.get(reason, 0) + 1
            if case.case_data.get("appeal_filed"):
                appeal_stats["total_appeals"] += 1
                if case.case_data.get("appeal_outcome") == "approved":
                    appeal_stats["successful_appeals"] += 1
        for case in similar_cases:
            if case.case_data.get("outcome") == "info_request":
                for detail in (case.case_data.get("info_request_details") or []):
                    info_request_reasons[detail] = info_request_reasons.get(detail, 0) + 1

        # Build top reasons sorted by frequency
        top_denial_reasons = [
            {"reason": reason, "count": count, "pct": round(count / len(denied) * 100) if denied else 0}
            for reason, count in sorted(denial_reason_counts.items(), key=lambda x: -x[1])
        ]
        top_info_request_reasons = [
            {"reason": reason, "count": count}
            for reason, count in sorted(info_request_reasons.items(), key=lambda x: -x[1])
        ]

        # Analyze compensating factors for the cohort
        current_docs_lower = {d.lower() for d in current_documentation}
        compensating_factors = self._analyze_compensating_factors(
            similar_cases, current_docs_lower, disease_severity,
            medication_name=medication_name, payer_name=payer_name
        )

        # Build statistical comparison
        comparison = self._build_cohort_comparison(approved, denied)

        # Synthesize insights via Claude
        llm_insights = await self._synthesize_cohort_differentiators(
            comparison=comparison,
            current_patient_profile=current_patient_profile,
            medication_name=medication_name,
            payer_name=payer_name,
            icd10_family=icd10_family,
        )

        # Separate patient-specific data from cacheable cohort data
        patient_position = llm_insights.pop("current_patient_position", None)
        parse_failed = llm_insights.pop("_parse_failed", False)

        # total_similar_cases = resolved cases only (approved + denied)
        resolved_total = len(approved) + len(denied)

        result = {
            "status": "partial" if parse_failed else "complete",
            "total_similar_cases": resolved_total,
            "approved_count": len(approved),
            "denied_count": len(denied),
            "info_request_count": info_request_count,
            "total_historical_cases": len(self.historical_cases),
            "compensating_factors": compensating_factors,
            "top_denial_reasons": top_denial_reasons,
            "top_info_request_reasons": top_info_request_reasons,
            "appeal_stats": appeal_stats,
            "cohort_comparison": {
                "approved_stats": comparison["approved_stats"],
                "denied_stats": comparison["denied_stats"],
            },
            **llm_insights,
        }

        # Cache cohort-level data only (no patient-specific position)
        await self._set_cached_cohort_analysis(
            cache_key_hash=cache_key,
            medication_name=medication_name,
            icd10_family=icd10_family,
            payer_name=payer_name,
            analysis_data=result,
            approved_count=len(approved),
            denied_count=len(denied),
            total_count=resolved_total,
        )

        # Add patient-specific position back for the response
        if patient_position:
            result["current_patient_position"] = patient_position

        logger.info(
            "Cohort analysis complete",
            case_id=case_id,
            approved=len(approved),
            denied=len(denied),
            insights=len(llm_insights.get("differentiating_insights", [])),
        )

        return result

    async def _synthesize_insights_with_llm(
        self,
        case_data: Dict[str, Any],
        patient_data: Dict[str, Any],
        similar_cases: List[SimilarCase],
        pattern_analysis: Dict[str, Any],
        payer_name: str,
        current_documentation: List[str]
    ) -> StrategicInsights:
        """Use LLM to synthesize comprehensive insights."""

        # Prepare similar cases summary for prompt
        similar_cases_summary = []
        for case in similar_cases[:10]:  # Limit to top 10 for context
            similar_cases_summary.append({
                "case_id": case.case_id,
                "similarity_score": round(case.similarity_score, 2),
                "outcome": case.case_data.get("outcome"),
                "days_to_decision": case.case_data.get("days_to_decision"),
                "documentation_present": case.case_data.get("documentation_present", []),
                "documentation_missing": case.case_data.get("documentation_missing", []),
                "denial_reason": case.case_data.get("denial_reason"),
                "appeal_outcome": case.case_data.get("appeal_outcome"),
                "notes": case.case_data.get("notes")
            })

        # Load and populate prompt
        prompt = self.prompt_loader.load(
            "strategy/strategic_intelligence.txt",
            {
                "case_id": case_data.get("case_id", "unknown"),
                "medication_name": self._extract_medication_name(case_data, patient_data),
                "icd10_code": self._extract_icd10_code(case_data, patient_data),
                "payer_name": payer_name,
                "current_documentation": json.dumps(current_documentation, indent=2),
                "similar_cases_count": len(similar_cases),
                "similar_cases_summary": json.dumps(similar_cases_summary, indent=2),
                "approval_rate": f"{pattern_analysis['approval_rate']:.0%}",
                "info_request_rate": f"{pattern_analysis['info_request_rate']:.0%}",
                "denial_rate": f"{pattern_analysis['denial_rate']:.0%}",
                "documentation_patterns": json.dumps(pattern_analysis["documentation_patterns"], indent=2),
                "timing_patterns": json.dumps(pattern_analysis["timing_patterns"], indent=2),
                "denial_reasons": json.dumps(pattern_analysis["denial_reasons"], indent=2),
                "embedded_patterns": json.dumps(self.historical_data.get("metadata", {}).get("embedded_patterns", {}), indent=2),
                "compensating_factors": json.dumps(pattern_analysis.get("compensating_factors", []), indent=2)
            }
        )

        # Call LLM
        result = await self.llm_gateway.generate(
            task_category=TaskCategory.POLICY_REASONING,
            prompt=prompt,
            temperature=0.2,
            response_format="json"
        )

        # Parse LLM response
        response_text = result.get("response", "{}")
        try:
            # Handle response that might have markdown code blocks
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            llm_insights = json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.warning("Failed to parse LLM response as JSON", error=str(e))
            llm_insights = {}

        # Build reasoning chain
        reasoning_chain = [
            f"Identified {len(similar_cases)} clinically similar historical cases",
            f"Historical approval rate for similar cases: {pattern_analysis['approval_rate']:.0%}",
            f"Info request rate: {pattern_analysis['info_request_rate']:.0%}",
        ]

        if pattern_analysis["documentation_patterns"]:
            top_doc = pattern_analysis["documentation_patterns"][0]
            reasoning_chain.append(
                f"Key documentation factor: {top_doc['documentation_type']} "
                f"increases approval by {top_doc['impact_delta']:.0%}"
            )

        # Add compensating factor insights to reasoning chain
        compensating_factors = pattern_analysis.get("compensating_factors", [])
        high_priority_factors = [f for f in compensating_factors if f.get("priority") == "high"]
        if high_priority_factors:
            for factor in high_priority_factors[:2]:  # Top 2 high-priority findings
                if factor.get("pattern_type") == "compensating_factor":
                    reasoning_chain.append(
                        f"PATTERN DISCOVERED: Despite missing {factor['missing_documentation'].replace('_', ' ')}, "
                        f"cases with compensating factors achieve {factor['approval_rate_with_compensation']:.0%} approval "
                        f"(vs {factor['approval_rate_without_compensation']:.0%} without). "
                        f"Uplift: +{factor['approval_uplift']:.0%}"
                    )
                elif factor.get("pattern_type") == "lab_severity_bundle":
                    reasoning_chain.append(
                        f"PATTERN DISCOVERED: Lab severity bundle (CRP>20, albumin<3.0, ESR>40) "
                        f"achieves {factor['approval_rate_with_bundle']:.0%} approval rate. "
                        f"Uplift: +{factor['approval_uplift']:.0%}"
                    )

        # Calculate confidence based on sample size
        confidence = min(0.95, 0.5 + (len(similar_cases) * 0.02))
        confidence_reasoning = "High confidence" if len(similar_cases) >= 15 else \
                      "Moderate confidence" if len(similar_cases) >= 5 else \
                      "Limited sample size - interpret with caution"

        # Get payer name for insights
        payer_name = case_data.get("patient", {}).get("primary_payer", "Unknown")

        # Build default payer insights structure
        default_payer_insights = {
            "payer_name": payer_name,
            "specific_requirements": [],
            "common_denial_reasons": [r.get("reason", "") for r in pattern_analysis.get("denial_reasons", [])[:3]],
            "success_factors": ["Complete documentation", "Clear diagnosis codes"],
            "avg_decision_days": pattern_analysis.get("avg_days_to_decision", 7)
        }

        # Build default timing recommendations structure
        best_day = "Tuesday"
        if pattern_analysis.get("timing_patterns"):
            # Find day with highest approval rate
            timing = pattern_analysis["timing_patterns"]
            if timing:
                sorted_timing = sorted(timing, key=lambda x: x.get("approval_rate", 0), reverse=True)
                if sorted_timing:
                    best_day = sorted_timing[0].get("day_of_week", "Tuesday")

        default_timing = {
            "optimal_submission_day": best_day,
            "reasoning": f"Historical data shows highest approval rates for submissions on {best_day}",
            "expected_impact": "5-10% higher approval rate"
        }

        # Transform reasoning chain to structured format
        structured_reasoning = []
        for idx, step_text in enumerate(reasoning_chain, 1):
            structured_reasoning.append({
                "step": idx,
                "observation": step_text,
                "inference": "Based on historical pattern analysis",
                "confidence": confidence
            })

        # Add LLM reasoning if available
        llm_reasoning = llm_insights.get("reasoning_chain", [])
        for item in llm_reasoning:
            if isinstance(item, dict):
                structured_reasoning.append(item)
            else:
                structured_reasoning.append({
                    "step": len(structured_reasoning) + 1,
                    "observation": str(item),
                    "inference": "LLM analysis",
                    "confidence": confidence
                })

        return StrategicInsights(
            similar_cases_count=len(similar_cases),
            approval_rate_for_similar=pattern_analysis["approval_rate"],
            denial_rate_for_similar=pattern_analysis["denial_rate"],
            info_request_rate_for_similar=pattern_analysis["info_request_rate"],
            avg_days_to_decision=pattern_analysis.get("avg_days_to_decision", 7.0),
            documentation_insights=llm_insights.get("documentation_insights", pattern_analysis["documentation_patterns"]),
            payer_insights=llm_insights.get("payer_insights", default_payer_insights),
            timing_recommendations=llm_insights.get("timing_recommendations", default_timing),
            risk_factors=llm_insights.get("risk_factors", []),
            recommended_actions=llm_insights.get("recommended_actions", []),
            counterfactual_scenarios=llm_insights.get("counterfactual_scenarios", []),
            reasoning_chain=structured_reasoning,
            confidence_score=confidence,
            confidence_reasoning=confidence_reasoning,
            compensating_factors=compensating_factors,
            agentic_insights=llm_insights.get("agentic_insights", []),
            evidence_summary=pattern_analysis.get("evidence_summary", {})
        )

    # ── Gap-Driven Cohort Analysis ──────────────────────────────────────

    async def generate_gap_driven_cohort_analysis(
        self,
        case_data: Dict[str, Any],
        patient_data: Dict[str, Any],
        documentation_gaps: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Generate gap-centric cohort analysis.

        For each documentation gap from policy analysis, analyzes how that gap
        historically impacts denial rates — broken down by current payer vs
        other payers — with severity and time-trend slicing.
        """
        case_id = case_data.get("case_id", "unknown")
        logger.info("Generating gap-driven cohort analysis", case_id=case_id, gap_count=len(documentation_gaps))

        medication_name = self._extract_medication_name(case_data, patient_data)
        icd10_code = self._extract_icd10_code(case_data, patient_data)
        payer_name = self._extract_payer_name(case_data, patient_data)
        disease_severity = self._extract_disease_severity(patient_data, case_data)
        prior_treatments = self._extract_prior_treatments(patient_data)
        current_documentation = self._extract_current_documentation(case_data, patient_data)
        current_docs_lower = {d.lower() for d in current_documentation}
        icd10_family = icd10_code[:3] if icd10_code else ""

        # Build current patient profile for differentiator analysis
        current_patient_profile = {
            "medication": medication_name,
            "payer": payer_name,
            "icd10_code": icd10_code,
            "disease_severity": disease_severity,
            "prior_treatments": prior_treatments,
            "documentation_present": current_documentation,
        }

        # Cache key: medication + payer + icd10_family + sorted gap IDs
        gap_ids = sorted(
            (g.get("gap_id") or g.get("id") or g.get("description", "")[:30])
            for g in documentation_gaps
        )
        gap_cache_key_parts = [
            medication_name.lower().strip(),
            icd10_family,
            payer_name.lower().strip(),
            "gaps:" + ",".join(gap_ids),
        ]
        gap_cache_key = hashlib.sha256("::".join(gap_cache_key_parts).encode()).hexdigest()

        cached = await self._get_cached_cohort_analysis(gap_cache_key)
        if cached:
            logger.info("Gap-driven cohort analysis cache hit", case_id=case_id)
            return cached

        # Find similar cases with broader threshold for gap analysis
        similar_cases = self.find_similar_cases(
            medication_name=medication_name,
            icd10_code=icd10_code,
            payer_name=payer_name,
            disease_severity=disease_severity,
            prior_treatments=prior_treatments,
            min_similarity=0.4,
            max_results=50,
        )

        if len(similar_cases) < 3:
            return {
                "status": "insufficient_data",
                "message": f"Need at least 3 similar cases for gap analysis. Found {len(similar_cases)}.",
                "total_cohort_size": len(similar_cases),
                "gap_analyses": [],
                "llm_synthesis": {},
                "filter_metadata": {},
            }

        # Map gap descriptions to historical doc keys via LLM
        gap_mappings = await self._map_gaps_to_historical_keys(documentation_gaps, similar_cases)

        # Analyze each gap's impact + PRPA differentiator analysis
        gap_analyses = []
        for gap in documentation_gaps:
            gap_id = gap.get("gap_id") or gap.get("id") or gap.get("description", "unknown")[:30]
            doc_key = gap_mappings.get(gap_id, "other")

            gap_stats = self._analyze_gap_impact(
                similar_cases=similar_cases,
                doc_key=doc_key,
                payer_name=payer_name,
            )

            # Get compensating factors for this specific gap
            compensating = self._analyze_compensating_factors(
                similar_cases, current_docs_lower, disease_severity,
                medication_name=medication_name, payer_name=payer_name
            )
            # Filter to factors relevant to this gap's doc key
            gap_compensating = [
                f for f in compensating
                if f.get("missing_documentation", "").lower() == doc_key.lower()
            ]

            # PRPA Phase: For gaps with sufficient data, discover differentiators
            if gap_stats["data_status"] == "sufficient" and gap_stats["overall"]["sample_size_missing"] >= 4:
                doc_key_lower = doc_key.lower()
                cases_with_gap_missing = [
                    c for c in similar_cases
                    if doc_key_lower in [d.lower() for d in c.case_data.get("documentation_missing", [])]
                ]
                gap_differentiators = await self._analyze_gap_differentiators(
                    cases_missing=cases_with_gap_missing,
                    doc_key=doc_key,
                    current_patient_profile=current_patient_profile,
                    medication_name=medication_name,
                    payer_name=payer_name,
                    icd10_family=icd10_family,
                )
            else:
                gap_differentiators = {"status": "insufficient_data"}

            gap_analyses.append({
                "gap_id": gap_id,
                "gap_description": gap.get("description", ""),
                "priority": gap.get("priority") or gap.get("severity", "medium"),
                "historical_doc_key": doc_key,
                **gap_stats,
                "compensating_factors": gap_compensating,
                "gap_differentiators": gap_differentiators,
            })

        # Collect filter metadata from cohort
        available_payers = sorted(set(
            c.case_data.get("payer", {}).get("name", "Unknown")
            for c in similar_cases
        ))
        available_severity_buckets = sorted(set(
            c.case_data.get("disease_severity", {}).get("severity_classification", "unknown")
            for c in similar_cases
            if c.case_data.get("disease_severity", {}).get("severity_classification")
        ))
        submission_dates = [
            c.case_data.get("submission_date", "")
            for c in similar_cases if c.case_data.get("submission_date")
        ]
        date_range = {
            "earliest": min(submission_dates) if submission_dates else "",
            "latest": max(submission_dates) if submission_dates else "",
        }

        # Synthesize all gap stats + differentiator insights via LLM
        llm_synthesis = await self._synthesize_gap_cohort(
            gap_analyses=gap_analyses,
            medication_name=medication_name,
            payer_name=payer_name,
            icd10_family=icd10_family,
            total_cohort_size=len(similar_cases),
            current_patient_profile=current_patient_profile,
        )

        result = {
            "status": "complete",
            "payer_name": payer_name,
            "total_cohort_size": len(similar_cases),
            "gap_analyses": gap_analyses,
            "llm_synthesis": llm_synthesis,
            "filter_metadata": {
                "available_payers": available_payers,
                "available_severity_buckets": available_severity_buckets,
                "date_range": date_range,
            },
        }

        # Cache the result
        approved = [c for c in similar_cases if c.case_data.get("outcome") == "approved"]
        denied = [c for c in similar_cases if c.case_data.get("outcome") == "denied"]
        await self._set_cached_cohort_analysis(
            cache_key_hash=gap_cache_key,
            medication_name=medication_name,
            icd10_family=icd10_family,
            payer_name=payer_name,
            analysis_data=result,
            approved_count=len(approved),
            denied_count=len(denied),
            total_count=len(similar_cases),
        )

        logger.info(
            "Gap-driven cohort analysis complete",
            case_id=case_id,
            gaps_analyzed=len(gap_analyses),
            cohort_size=len(similar_cases),
        )

        return result

    async def _map_gaps_to_historical_keys(
        self,
        documentation_gaps: List[Dict[str, Any]],
        similar_cases: List["SimilarCase"],
    ) -> Dict[str, str]:
        """Map natural-language gap descriptions to historical case doc keys via LLM."""
        # Build vocabulary of available doc keys from the cohort, split by data availability
        keys_present_only = set()
        keys_with_missing = set()
        for case in similar_cases:
            for doc in case.case_data.get("documentation_present", []):
                keys_present_only.add(doc.lower())
            for doc in case.case_data.get("documentation_missing", []):
                keys_with_missing.add(doc.lower())
        # Keys that appear ONLY in documentation_present (no missing-case data)
        keys_present_only = keys_present_only - keys_with_missing
        all_doc_keys = keys_with_missing | keys_present_only

        gap_descriptions = []
        for gap in documentation_gaps:
            gap_id = gap.get("gap_id") or gap.get("id") or gap.get("description", "unknown")[:30]
            gap_descriptions.append({
                "gap_id": gap_id,
                "description": gap.get("description", ""),
            })

        prompt = self.prompt_loader.load(
            "policy_analysis/gap_to_doc_key_mapping.txt",
            {
                "available_doc_keys": json.dumps(sorted(all_doc_keys), indent=2),
                "keys_with_missing_cases": json.dumps(sorted(keys_with_missing), indent=2),
                "keys_present_only": json.dumps(sorted(keys_present_only), indent=2),
                "gap_descriptions": json.dumps(gap_descriptions, indent=2),
            }
        )

        result = await self.llm_gateway.generate(
            task_category=TaskCategory.POLICY_REASONING,
            prompt=prompt,
            temperature=0.0,
            response_format="json",
        )

        # Parse response
        mappings = {}
        try:
            response_data = result if isinstance(result, dict) else {}
            # Handle both direct dict and wrapped response
            if "response" in response_data:
                response_text = response_data["response"]
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                response_data = json.loads(response_text)

            # Strip gateway metadata
            response_data = {k: v for k, v in response_data.items() if k not in ("provider", "task_category")}

            for mapping in response_data.get("mappings", []):
                mappings[mapping["gap_id"]] = mapping.get("historical_doc_key", "other")
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.warning("Failed to parse gap-to-key mapping", error=str(e))
            # Fallback: simple keyword matching
            for gap in documentation_gaps:
                gap_id = gap.get("gap_id") or gap.get("id") or gap.get("description", "unknown")[:30]
                desc_lower = gap.get("description", "").lower()
                matched = False
                for key in all_doc_keys:
                    # Simple substring match
                    key_words = key.replace("_", " ")
                    if key_words in desc_lower or key in desc_lower:
                        mappings[gap_id] = key
                        matched = True
                        break
                if not matched:
                    mappings[gap_id] = "other"

        logger.info("Gap-to-key mappings", mappings=mappings)
        return mappings

    def _analyze_gap_impact(
        self,
        similar_cases: List["SimilarCase"],
        doc_key: str,
        payer_name: str,
    ) -> Dict[str, Any]:
        """
        Analyze the impact of a specific documentation gap on denial rates.

        Splits the cohort by doc presence/absence and computes denial rates
        overall, by this payer, by other payers, per-payer breakdown,
        severity breakdown, and time trends.
        """
        doc_key_lower = doc_key.lower()

        # Split cohort by doc presence
        cases_missing = []
        cases_present = []
        for case in similar_cases:
            docs_present = [d.lower() for d in case.case_data.get("documentation_present", [])]
            docs_missing = [d.lower() for d in case.case_data.get("documentation_missing", [])]

            if doc_key_lower in docs_missing:
                cases_missing.append(case)
            elif doc_key_lower in docs_present:
                cases_present.append(case)
            # Cases where this doc isn't mentioned at all are excluded

        def _denial_rate(cases: List["SimilarCase"]) -> float:
            if not cases:
                return 0.0
            denied = sum(1 for c in cases if c.case_data.get("outcome") == "denied")
            resolved = sum(1 for c in cases if c.case_data.get("outcome") in ("approved", "denied"))
            return denied / resolved if resolved > 0 else 0.0

        def _sample_size(cases: List["SimilarCase"]) -> int:
            return sum(1 for c in cases if c.case_data.get("outcome") in ("approved", "denied"))

        def _approved_count(cases: List["SimilarCase"]) -> int:
            return sum(1 for c in cases if c.case_data.get("outcome") == "approved")

        def _denied_count(cases: List["SimilarCase"]) -> int:
            return sum(1 for c in cases if c.case_data.get("outcome") == "denied")

        # Overall rates
        overall = {
            "denial_rate_when_missing": round(_denial_rate(cases_missing), 3),
            "denial_rate_when_present": round(_denial_rate(cases_present), 3),
            "impact_delta": round(_denial_rate(cases_missing) - _denial_rate(cases_present), 3),
            "sample_size_missing": _sample_size(cases_missing),
            "sample_size_present": _sample_size(cases_present),
            "approved_when_missing": _approved_count(cases_missing),
            "denied_when_missing": _denied_count(cases_missing),
            "approved_when_present": _approved_count(cases_present),
            "denied_when_present": _denied_count(cases_present),
        }

        # This payer vs other payers
        payer_lower = payer_name.lower()
        this_payer_missing = [c for c in cases_missing if payer_lower in c.case_data.get("payer", {}).get("name", "").lower()]
        this_payer_present = [c for c in cases_present if payer_lower in c.case_data.get("payer", {}).get("name", "").lower()]
        other_payer_missing = [c for c in cases_missing if payer_lower not in c.case_data.get("payer", {}).get("name", "").lower()]
        other_payer_present = [c for c in cases_present if payer_lower not in c.case_data.get("payer", {}).get("name", "").lower()]

        this_payer = {
            "payer_name": payer_name,
            "denial_rate_when_missing": round(_denial_rate(this_payer_missing), 3),
            "denial_rate_when_present": round(_denial_rate(this_payer_present), 3),
            "impact_delta": round(_denial_rate(this_payer_missing) - _denial_rate(this_payer_present), 3),
            "sample_size_missing": _sample_size(this_payer_missing),
            "sample_size_present": _sample_size(this_payer_present),
            "approved_when_missing": _approved_count(this_payer_missing),
            "denied_when_missing": _denied_count(this_payer_missing),
        }

        other_payers = {
            "denial_rate_when_missing": round(_denial_rate(other_payer_missing), 3),
            "denial_rate_when_present": round(_denial_rate(other_payer_present), 3),
            "impact_delta": round(_denial_rate(other_payer_missing) - _denial_rate(other_payer_present), 3),
            "sample_size_missing": _sample_size(other_payer_missing),
            "sample_size_present": _sample_size(other_payer_present),
            "approved_when_missing": _approved_count(other_payer_missing),
            "denied_when_missing": _denied_count(other_payer_missing),
        }

        # Per-payer breakdown
        payer_breakdown = {}
        for case in cases_missing:
            p = case.case_data.get("payer", {}).get("name", "Unknown")
            if p not in payer_breakdown:
                payer_breakdown[p] = {"missing_cases": [], "payer_name": p}
            payer_breakdown[p]["missing_cases"].append(case)

        by_payer = []
        for p_name, p_data in payer_breakdown.items():
            by_payer.append({
                "payer_name": p_name,
                "denial_rate_missing": round(_denial_rate(p_data["missing_cases"]), 3),
                "sample_size": _sample_size(p_data["missing_cases"]),
            })
        by_payer.sort(key=lambda x: x["denial_rate_missing"], reverse=True)

        # Top denial reasons from denied cases with this doc missing
        denial_reason_counts: Dict[str, int] = {}
        for case in cases_missing:
            if case.case_data.get("outcome") == "denied":
                reason = case.case_data.get("denial_reason")
                if reason:
                    denial_reason_counts[reason] = denial_reason_counts.get(reason, 0) + 1

        total_denied_missing = sum(denial_reason_counts.values()) or 1
        top_denial_reasons = [
            {"reason": reason, "count": count, "pct": round(count / total_denied_missing * 100, 1)}
            for reason, count in sorted(denial_reason_counts.items(), key=lambda x: -x[1])[:5]
        ]

        # Severity breakdown: within missing-doc cases, group by severity → denial rate
        severity_groups: Dict[str, List["SimilarCase"]] = {}
        for case in cases_missing:
            sev = case.case_data.get("disease_severity", {}).get("severity_classification", "unknown")
            if sev not in severity_groups:
                severity_groups[sev] = []
            severity_groups[sev].append(case)

        severity_breakdown = {}
        for sev, cases in severity_groups.items():
            severity_breakdown[sev] = {
                "denial_rate": round(_denial_rate(cases), 3),
                "sample_size": _sample_size(cases),
            }

        # Time trend: within missing-doc cases, group by quarter → denial rate
        quarter_groups: Dict[str, List["SimilarCase"]] = {}
        for case in cases_missing:
            sub_date = case.case_data.get("submission_date", "")
            if sub_date:
                try:
                    dt = datetime.strptime(sub_date, "%Y-%m-%d")
                    quarter = f"{dt.year}-Q{(dt.month - 1) // 3 + 1}"
                    if quarter not in quarter_groups:
                        quarter_groups[quarter] = []
                    quarter_groups[quarter].append(case)
                except ValueError:
                    pass

        time_trend = [
            {
                "period": period,
                "denial_rate": round(_denial_rate(cases), 3),
                "sample_size": _sample_size(cases),
            }
            for period, cases in sorted(quarter_groups.items())
        ]

        # Appeal stats for denied cases with this doc missing
        appeals_filed = sum(1 for c in cases_missing if c.case_data.get("outcome") == "denied" and c.case_data.get("appeal_filed"))
        appeals_successful = sum(1 for c in cases_missing if c.case_data.get("outcome") == "denied" and c.case_data.get("appeal_filed") and c.case_data.get("appeal_outcome") == "approved")
        gap_appeal_stats = {
            "total_appeals": appeals_filed,
            "successful_appeals": appeals_successful,
        }

        # Data availability signal for frontend three-state rendering
        has_missing_data = len(cases_missing) >= 2
        if not cases_missing:
            data_status = "no_missing_cases"
        elif not has_missing_data:
            data_status = "low_sample"
        else:
            data_status = "sufficient"

        if not cases_missing:
            interpretation = f"No historical cases found with {doc_key.replace('_', ' ')} missing. This gap has no precedent in the cohort."
        elif _denial_rate(cases_missing) == 0.0 and len(cases_missing) >= 3:
            interpretation = f"This gap has not led to denials in {_sample_size(cases_missing)} similar cases — compensating factors may explain this."
        elif _denial_rate(cases_missing) > 0:
            interpretation = f"Missing {doc_key.replace('_', ' ')} is associated with {round(_denial_rate(cases_missing) * 100)}% denial rate ({_sample_size(cases_missing)} cases)."
        else:
            interpretation = f"Limited data: only {_sample_size(cases_missing)} resolved case(s) with this gap."

        return {
            "overall": overall,
            "this_payer": this_payer,
            "other_payers": other_payers,
            "by_payer": by_payer,
            "top_denial_reasons": top_denial_reasons,
            "appeal_stats": gap_appeal_stats,
            "severity_breakdown": severity_breakdown,
            "time_trend": time_trend,
            "data_status": data_status,
            "interpretation": interpretation,
        }

    async def _analyze_gap_differentiators(
        self,
        cases_missing: List["SimilarCase"],
        doc_key: str,
        current_patient_profile: Dict[str, Any],
        medication_name: str,
        payer_name: str,
        icd10_family: str,
    ) -> Dict[str, Any]:
        """
        Per-gap PRPA: split missing-doc cases into approved vs denied,
        build statistical comparison, then call Claude to discover
        what clinical factors differentiate approval despite the gap.
        """
        approved = [c for c in cases_missing if c.case_data.get("outcome") == "approved"]
        denied = [c for c in cases_missing if c.case_data.get("outcome") == "denied"]

        if len(approved) < 2 or len(denied) < 2:
            return {"status": "insufficient_data"}

        comparison = self._build_cohort_comparison(approved, denied)

        prompt = self.prompt_loader.load(
            "policy_analysis/gap_differentiator_analysis.txt",
            {
                "doc_key": doc_key.replace("_", " "),
                "total_missing_cases": str(len(approved) + len(denied)),
                "approved_count": str(len(approved)),
                "denied_count": str(len(denied)),
                "medication_name": medication_name,
                "payer_name": payer_name,
                "icd10_family": icd10_family,
                "current_patient_profile": json.dumps(current_patient_profile, indent=2),
                "approved_cohort_stats": json.dumps(comparison["approved_stats"], indent=2),
                "denied_cohort_stats": json.dumps(comparison["denied_stats"], indent=2),
                "differential_metrics": json.dumps(comparison["differential"], indent=2),
            }
        )

        result = await self.llm_gateway.generate(
            task_category=TaskCategory.POLICY_REASONING,
            prompt=prompt,
            temperature=0.2,
            response_format="json",
        )

        insights = {k: v for k, v in result.items() if k not in ("provider", "task_category")}

        # Handle wrapped response
        if "response" in insights:
            response_text = insights["response"]
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            insights = json.loads(response_text)

        expected_keys = {"differentiating_insights", "actionable_recommendations", "current_patient_position", "hidden_patterns"}
        found = set(insights.keys()) & expected_keys
        if not found:
            logger.warning("Gap differentiator LLM returned no expected keys", doc_key=doc_key, keys=list(insights.keys()))
            return {"status": "parse_failed"}

        insights["status"] = "complete"
        logger.info("Gap differentiator analysis complete", doc_key=doc_key, insight_count=len(insights.get("differentiating_insights", [])))
        return insights

    async def _synthesize_gap_cohort(
        self,
        gap_analyses: List[Dict[str, Any]],
        medication_name: str,
        payer_name: str,
        icd10_family: str,
        total_cohort_size: int,
        current_patient_profile: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Use Claude to synthesize multi-gap risk with per-gap differentiator insights."""
        # Build per-gap insights summary including differentiator results
        per_gap_insights = []
        for ga in gap_analyses:
            summary = {
                "gap_id": ga["gap_id"],
                "gap_description": ga["gap_description"],
                "data_status": ga.get("data_status"),
                "overall": ga.get("overall"),
                "interpretation": ga.get("interpretation"),
            }
            # Include differentiator insights if available
            diff = ga.get("gap_differentiators", {})
            if diff.get("status") == "complete":
                summary["differentiator_insights"] = diff.get("differentiating_insights", [])
                summary["patient_position"] = diff.get("current_patient_position", {})
                summary["hidden_patterns"] = diff.get("hidden_patterns", [])
            else:
                summary["differentiator_insights"] = None
                summary["differentiator_status"] = diff.get("status", "not_analyzed")
            per_gap_insights.append(summary)

        prompt = self.prompt_loader.load(
            "policy_analysis/gap_cohort_synthesis.txt",
            {
                "medication_name": medication_name,
                "payer_name": payer_name,
                "icd10_family": icd10_family,
                "total_cohort_size": str(total_cohort_size),
                "current_patient_profile": json.dumps(current_patient_profile, indent=2),
                "per_gap_insights": json.dumps(per_gap_insights, indent=2),
            }
        )

        result = await self.llm_gateway.generate(
            task_category=TaskCategory.POLICY_REASONING,
            prompt=prompt,
            temperature=0.2,
            response_format="json",
        )

        # Parse response
        try:
            synthesis = {k: v for k, v in result.items() if k not in ("provider", "task_category")}

            # Handle wrapped response
            if "response" in synthesis:
                response_text = synthesis["response"]
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                synthesis = json.loads(response_text)

            expected_keys = {"analysis_strategy", "overall_risk_assessment", "gap_priority_ranking", "recommended_actions", "hidden_insights", "patient_position_summary"}
            found = set(synthesis.keys()) & expected_keys
            if not found:
                logger.warning("Gap synthesis LLM returned no expected keys", keys=list(synthesis.keys()))
                return self._default_gap_synthesis(gap_analyses)

            return synthesis

        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse gap synthesis response", error=str(e))
            return self._default_gap_synthesis(gap_analyses)

    def _default_gap_synthesis(self, gap_analyses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Provide a structured default when LLM synthesis fails."""
        # Sort by impact delta descending
        ranked = sorted(gap_analyses, key=lambda g: g.get("overall", {}).get("impact_delta", 0), reverse=True)
        return {
            "analysis_strategy": f"Analyzed {len(gap_analyses)} documentation gaps against historical cohort data.",
            "overall_risk_assessment": f"{len(gap_analyses)} documentation gaps identified. Review individual gap cards for payer-specific denial risk data.",
            "gap_priority_ranking": [
                {"gap_id": g["gap_id"], "rank": i + 1, "rationale": f"Impact delta: {g.get('overall', {}).get('impact_delta', 0):.0%}"}
                for i, g in enumerate(ranked)
            ],
            "compensable_gaps": [],
            "recommended_actions": [],
        }



# Global instance
_strategic_intelligence_agent: Optional[StrategicIntelligenceAgent] = None


def get_strategic_intelligence_agent() -> StrategicIntelligenceAgent:
    """Get or create the global strategic intelligence agent."""
    global _strategic_intelligence_agent
    if _strategic_intelligence_agent is None:
        _strategic_intelligence_agent = StrategicIntelligenceAgent()
    return _strategic_intelligence_agent
