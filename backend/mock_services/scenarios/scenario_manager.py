"""Scenario manager for controlling mock service behavior."""
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any

from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class Scenario(str, Enum):
    """Available demonstration scenarios."""
    HAPPY_PATH = "happy_path"
    MISSING_DOCS = "missing_docs"
    PRIMARY_DENY = "primary_deny"
    SECONDARY_DENY = "secondary_deny"
    RECOVERY_SUCCESS = "recovery_success"
    DUAL_APPROVAL = "dual_approval"


@dataclass
class ScenarioConfig:
    """Configuration for a scenario."""
    name: str
    description: str
    cigna_behavior: str
    uhc_behavior: str
    expected_outcome: str
    demo_highlights: List[str] = field(default_factory=list)


# Scenario definitions
SCENARIO_CONFIGS: Dict[Scenario, ScenarioConfig] = {
    Scenario.HAPPY_PATH: ScenarioConfig(
        name="Happy Path",
        description="Both payers approve the PA request without issues",
        cigna_behavior="approve",
        uhc_behavior="approve",
        expected_outcome="Both approvals obtained, treatment can begin",
        demo_highlights=[
            "Clean submission process",
            "Rapid approval from both payers",
            "Strategy scoring in action",
            "Complete audit trail"
        ]
    ),
    Scenario.MISSING_DOCS: ScenarioConfig(
        name="Missing Documentation",
        description="UHC requests TB screening documentation",
        cigna_behavior="approve",
        uhc_behavior="pending_info",
        expected_outcome="Approval after document submission",
        demo_highlights=[
            "Automatic gap detection",
            "Document request handling",
            "Adaptive workflow",
            "Provider notification"
        ]
    ),
    Scenario.PRIMARY_DENY: ScenarioConfig(
        name="Primary Payer Denial",
        description="Cigna denies due to step therapy concerns",
        cigna_behavior="deny",
        uhc_behavior="approve",
        expected_outcome="Recovery via appeal or secondary pathway",
        demo_highlights=[
            "Denial reason analysis",
            "Automatic recovery initiation",
            "Appeal strategy generation",
            "Alternative pathway evaluation"
        ]
    ),
    Scenario.SECONDARY_DENY: ScenarioConfig(
        name="Biosimilar Redirect",
        description="UHC requires biosimilar instead of reference product",
        cigna_behavior="approve",
        uhc_behavior="biosimilar_redirect",
        expected_outcome="Resolution via biosimilar acceptance or exception",
        demo_highlights=[
            "Formulary exception handling",
            "Product substitution logic",
            "Clinical justification for reference product"
        ]
    ),
    Scenario.RECOVERY_SUCCESS: ScenarioConfig(
        name="Recovery Success",
        description="Initial denial followed by successful appeal",
        cigna_behavior="deny_then_approve_appeal",
        uhc_behavior="approve",
        expected_outcome="Approval obtained through appeal process",
        demo_highlights=[
            "Full appeal workflow",
            "Peer-to-peer scheduling",
            "Appeal letter generation",
            "Recovery tracking"
        ]
    ),
    Scenario.DUAL_APPROVAL: ScenarioConfig(
        name="Optimized Strategy Demo",
        description="Demonstrates UHC-first optimized strategy advantage",
        cigna_behavior="slow_approval",
        uhc_behavior="fast_approval",
        expected_outcome="Faster treatment start via optimized routing",
        demo_highlights=[
            "Strategy scoring comparison",
            "Optimized vs sequential timing",
            "Policy analysis driving decisions"
        ]
    )
}


class ScenarioManager:
    """
    Manages scenario state for mock services.
    Allows switching between scenarios for demonstration.
    """

    def __init__(self):
        """Initialize with default scenario."""
        self._current_scenario = Scenario.HAPPY_PATH
        self._payer_gateways: Dict[str, Any] = {}
        logger.info("Scenario manager initialized", scenario=self._current_scenario.value)

    @property
    def current_scenario(self) -> Scenario:
        """Get current scenario."""
        return self._current_scenario

    @property
    def current_config(self) -> ScenarioConfig:
        """Get current scenario configuration."""
        return SCENARIO_CONFIGS[self._current_scenario]

    def set_scenario(self, scenario: Scenario) -> ScenarioConfig:
        """
        Switch to a different scenario.

        Args:
            scenario: Scenario to activate

        Returns:
            Configuration for the new scenario
        """
        self._current_scenario = scenario
        config = SCENARIO_CONFIGS[scenario]

        # Update registered payer gateways
        for payer_name, gateway in self._payer_gateways.items():
            payer_key = payer_name.lower()
            if payer_key == "cigna":
                gateway.set_scenario(self._get_cigna_scenario_key(scenario))
            elif payer_key == "uhc":
                gateway.set_scenario(self._get_uhc_scenario_key(scenario))
            elif hasattr(gateway, 'set_scenario'):
                # Generic gateways use the scenario value directly
                gateway.set_scenario(scenario.value)

        logger.info(
            "Scenario changed",
            scenario=scenario.value,
            description=config.description
        )

        return config

    def register_gateway(self, payer_name: str, gateway: Any) -> None:
        """
        Register a payer gateway for scenario updates.

        Args:
            payer_name: Name of the payer
            gateway: Gateway instance
        """
        self._payer_gateways[payer_name] = gateway
        logger.debug("Gateway registered", payer=payer_name)

    def list_scenarios(self) -> List[Dict[str, Any]]:
        """
        List all available scenarios.

        Returns:
            List of scenario information
        """
        return [
            {
                "id": scenario.value,
                "name": config.name,
                "description": config.description,
                "expected_outcome": config.expected_outcome,
                "demo_highlights": config.demo_highlights,
                "is_current": scenario == self._current_scenario
            }
            for scenario, config in SCENARIO_CONFIGS.items()
        ]

    def get_scenario_info(self, scenario: Optional[Scenario] = None) -> Dict[str, Any]:
        """
        Get detailed information about a scenario.

        Args:
            scenario: Scenario to describe (defaults to current)

        Returns:
            Scenario details
        """
        scenario = scenario or self._current_scenario
        config = SCENARIO_CONFIGS[scenario]

        return {
            "id": scenario.value,
            "name": config.name,
            "description": config.description,
            "payer_behaviors": {
                "cigna": config.cigna_behavior,
                "uhc": config.uhc_behavior
            },
            "expected_outcome": config.expected_outcome,
            "demo_highlights": config.demo_highlights
        }

    def _get_cigna_scenario_key(self, scenario: Scenario) -> str:
        """Map scenario to Cigna gateway scenario key."""
        mapping = {
            Scenario.HAPPY_PATH: "happy_path",
            Scenario.MISSING_DOCS: "happy_path",  # Cigna approves
            Scenario.PRIMARY_DENY: "primary_deny",
            Scenario.SECONDARY_DENY: "happy_path",
            Scenario.RECOVERY_SUCCESS: "recovery_success",
            Scenario.DUAL_APPROVAL: "happy_path",
        }
        return mapping.get(scenario, "happy_path")

    def _get_uhc_scenario_key(self, scenario: Scenario) -> str:
        """Map scenario to UHC gateway scenario key."""
        mapping = {
            Scenario.HAPPY_PATH: "happy_path",
            Scenario.MISSING_DOCS: "missing_docs",  # UHC requests TB
            Scenario.PRIMARY_DENY: "happy_path",  # UHC approves
            Scenario.SECONDARY_DENY: "secondary_deny",
            Scenario.RECOVERY_SUCCESS: "happy_path",
            Scenario.DUAL_APPROVAL: "happy_path",
        }
        return mapping.get(scenario, "happy_path")


# Global instance
_scenario_manager: Optional[ScenarioManager] = None


def get_scenario_manager() -> ScenarioManager:
    """Get or create the global scenario manager."""
    global _scenario_manager
    if _scenario_manager is None:
        _scenario_manager = ScenarioManager()
    return _scenario_manager
