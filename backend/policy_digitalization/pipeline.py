"""Policy digitalization pipeline — stub for Patient Services.

PS imports MEDICATION_NAME_ALIASES and get_digitalization_pipeline from
policy_reasoner and strategic_intelligence_agent. This stub provides those
symbols so imports succeed. The actual digitalization pipeline runs in PDI.
"""
import json
from pathlib import Path

from backend.config.logging_config import get_logger

logger = get_logger(__name__)


def _load_medication_aliases() -> dict:
    """Load medication name aliases from config file."""
    config_path = Path("data/config/medication_aliases.json")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("aliases", {})
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning("Could not load medication aliases config", error=str(e))
        return {}


MEDICATION_NAME_ALIASES = _load_medication_aliases()


class PolicyDigitalizationPipeline:
    """Reads digitized policies from NeonDB via PolicyRepository."""

    def __init__(self):
        from backend.policy_digitalization.policy_repository import get_policy_repository
        self._repo = get_policy_repository()

    async def get_or_digitalize(self, payer_name: str, medication_name: str):
        """Load digitized policy from DB. Raises PolicyNotFoundError if missing."""
        from backend.policy_digitalization.exceptions import PolicyNotFoundError

        policy = await self._repo.load(payer_name, medication_name)
        if policy is None:
            raise PolicyNotFoundError(
                f"No digitized policy found for {payer_name}/{medication_name}"
            )
        return policy


_pipeline = None


def get_digitalization_pipeline() -> PolicyDigitalizationPipeline:
    """Get or create global pipeline instance."""
    global _pipeline
    if _pipeline is None:
        _pipeline = PolicyDigitalizationPipeline()
    return _pipeline
