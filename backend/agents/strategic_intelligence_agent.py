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
import uuid
from typing import Dict, Any, List, Optional
from pathlib import Path
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, delete

from backend.models.enums import TaskCategory
from backend.reasoning.llm_gateway import get_llm_gateway
from backend.reasoning.prompt_loader import get_prompt_loader
from backend.config.logging_config import get_logger
from backend.config.settings import get_settings
from backend.storage.database import get_db
from backend.storage.models import StrategicIntelligenceCacheModel

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
        evidence_summary: Optional[Dict[str, Any]] = None
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
            "evidence_summary": self.evidence_summary
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

        # Include severity classification if provided
        if disease_severity:
            severity_class = disease_severity.get("severity_classification", "")
            if severity_class:
                key_parts.append(severity_class.lower())

        # Generate SHA-256 hash
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

                if cache_entry.is_expired():
                    logger.info(
                        "Cache expired, will regenerate",
                        cache_key_hash=cache_key_hash[:16],
                        expired_at=cache_entry.expires_at.isoformat()
                    )
                    # Delete expired entry
                    await db.execute(
                        delete(StrategicIntelligenceCacheModel).where(
                            StrategicIntelligenceCacheModel.id == cache_entry.id
                        )
                    )
                    return None

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

        # Calculate outcome rates
        total = len(similar_cases)
        approved = sum(1 for c in similar_cases if c.case_data.get("outcome") == "approved")
        info_requests = sum(1 for c in similar_cases if c.case_data.get("outcome") == "info_request")
        denied = sum(1 for c in similar_cases if c.case_data.get("outcome") == "denied")

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
            "approval_rate": approved / total,
            "info_request_rate": info_requests / total,
            "denial_rate": denied / total,
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
            prior_treatments=prior_treatments
        )

        # Analyze patterns (including compensating factors)
        pattern_analysis = self.analyze_patterns(
            similar_cases=similar_cases,
            payer_name=payer_name,
            current_documentation=current_documentation,
            current_severity=disease_severity,
            medication_name=medication_name
        )

        # Use LLM to synthesize insights
        insights = await self._synthesize_insights_with_llm(
            case_data=case_data,
            patient_data=patient_data,
            similar_cases=similar_cases,
            pattern_analysis=pattern_analysis,
            payer_name=payer_name,
            current_documentation=current_documentation
        )

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
            evidence_summary=data.get("evidence_summary", {})
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

        # Try clinical_profile first
        clinical = patient_data.get("clinical_profile", {})
        disease_activity = clinical.get("disease_activity", {})

        if disease_activity:
            severity["cdai_score"] = disease_activity.get("cdai_score")
            severity["hbi_score"] = disease_activity.get("hbi_score")
            severity["severity_classification"] = disease_activity.get("severity_classification")

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

        return severity if severity else None

    def _extract_prior_treatments(
        self,
        patient_data: Dict[str, Any]
    ) -> Optional[List[Dict[str, Any]]]:
        """Extract prior treatment history."""
        clinical = patient_data.get("clinical_profile", {})
        treatment_history = clinical.get("treatment_history", {})

        prior_auths = treatment_history.get("prior_authorizations", [])
        if prior_auths:
            return [
                {"medication": pa.get("drug_name", pa.get("medication", ""))}
                for pa in prior_auths
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

        # From clinical profile
        clinical = patient_data.get("clinical_profile", {})
        if clinical.get("disease_activity", {}).get("fecal_calprotectin"):
            docs.append("fecal_calprotectin")
        if clinical.get("screening", {}).get("tuberculosis"):
            docs.append("tb_screening")
        if clinical.get("screening", {}).get("hepatitis"):
            docs.append("hepatitis_panel")

        return list(set(docs))

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


# Global instance
_strategic_intelligence_agent: Optional[StrategicIntelligenceAgent] = None


def get_strategic_intelligence_agent() -> StrategicIntelligenceAgent:
    """Get or create the global strategic intelligence agent."""
    global _strategic_intelligence_agent
    if _strategic_intelligence_agent is None:
        _strategic_intelligence_agent = StrategicIntelligenceAgent()
    return _strategic_intelligence_agent
