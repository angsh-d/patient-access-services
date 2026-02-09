"""NPI (National Provider Identifier) validation using CMS NPI Registry.

This module validates provider credentials against the official CMS NPI Registry API.
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum

from backend.mcp.mcp_client import get_mcp_client
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class NPIType(str, Enum):
    """NPI entity types."""
    INDIVIDUAL = "NPI-1"  # Individual provider
    ORGANIZATION = "NPI-2"  # Organization


@dataclass
class NPIValidationResult:
    """Result of an NPI validation lookup."""
    npi: str
    is_valid: bool
    provider_name: Optional[str] = None
    provider_type: Optional[NPIType] = None
    credential: Optional[str] = None
    specialty: Optional[str] = None
    practice_address: Optional[Dict[str, str]] = None
    enumeration_date: Optional[str] = None
    last_updated: Optional[str] = None
    status: str = "active"
    errors: List[str] = field(default_factory=list)
    raw_response: Optional[Dict[str, Any]] = None


class NPIValidator:
    """
    Validates NPI numbers against the CMS NPI Registry.

    Uses the official CMS NPPES API:
    https://npiregistry.cms.hhs.gov/api/
    """

    def __init__(self):
        """Initialize the NPI validator."""
        self._client = get_mcp_client()
        logger.info("NPI Validator initialized")

    async def validate_npi(self, npi: str) -> NPIValidationResult:
        """
        Validate a single NPI number.

        Args:
            npi: 10-digit NPI number

        Returns:
            NPIValidationResult with provider details or errors
        """
        logger.info("Validating NPI", npi=npi)

        # Basic format validation
        if not self._is_valid_format(npi):
            return NPIValidationResult(
                npi=npi,
                is_valid=False,
                errors=["Invalid NPI format. Must be 10 digits."]
            )

        try:
            # Call NPI Registry API
            response = await self._client.call(
                server="npi",
                endpoint="/",
                params={
                    "version": "2.1",
                    "number": npi,
                    "pretty": "true"
                }
            )

            return self._parse_response(npi, response)

        except Exception as e:
            logger.error("NPI validation failed", npi=npi, error=str(e))
            return NPIValidationResult(
                npi=npi,
                is_valid=False,
                errors=[f"Validation service error: {str(e)}"]
            )

    async def validate_batch(self, npis: List[str]) -> Dict[str, NPIValidationResult]:
        """
        Validate multiple NPI numbers concurrently.

        Args:
            npis: List of NPI numbers to validate

        Returns:
            Dictionary mapping NPI to validation result
        """
        import asyncio

        logger.info("Validating NPI batch", count=len(npis))

        # Validate all NPIs concurrently
        tasks = [self.validate_npi(npi) for npi in npis]
        validation_results = await asyncio.gather(*tasks, return_exceptions=True)

        results = {}
        for npi, result in zip(npis, validation_results):
            if isinstance(result, Exception):
                results[npi] = NPIValidationResult(
                    npi=npi,
                    is_valid=False,
                    errors=[f"Validation error: {str(result)}"]
                )
            else:
                results[npi] = result

        return results

    def _is_valid_format(self, npi: str) -> bool:
        """Check if NPI has valid format (10 digits)."""
        return npi.isdigit() and len(npi) == 10

    def _parse_response(self, npi: str, response: Dict[str, Any]) -> NPIValidationResult:
        """Parse NPI Registry API response."""
        result_count = response.get("result_count", 0)

        if result_count == 0:
            return NPIValidationResult(
                npi=npi,
                is_valid=False,
                errors=["NPI not found in registry"]
            )

        results = response.get("results", [])
        if not results:
            return NPIValidationResult(
                npi=npi,
                is_valid=False,
                errors=["No results returned from registry"]
            )

        provider = results[0]

        # Extract provider name based on type
        entity_type = provider.get("enumeration_type", "")
        if entity_type == "NPI-1":
            basic = provider.get("basic", {})
            provider_name = f"{basic.get('first_name', '')} {basic.get('last_name', '')}".strip()
            credential = basic.get("credential", "")
            provider_type = NPIType.INDIVIDUAL
        else:
            basic = provider.get("basic", {})
            provider_name = basic.get("organization_name", "")
            credential = None
            provider_type = NPIType.ORGANIZATION

        # Extract specialty from taxonomies
        taxonomies = provider.get("taxonomies", [])
        primary_taxonomy = next(
            (t for t in taxonomies if t.get("primary", False)),
            taxonomies[0] if taxonomies else {}
        )
        specialty = primary_taxonomy.get("desc", "")

        # Extract practice address
        addresses = provider.get("addresses", [])
        practice_address = None
        for addr in addresses:
            if addr.get("address_purpose") == "LOCATION":
                practice_address = {
                    "address_1": addr.get("address_1", ""),
                    "address_2": addr.get("address_2", ""),
                    "city": addr.get("city", ""),
                    "state": addr.get("state", ""),
                    "postal_code": addr.get("postal_code", ""),
                    "country": addr.get("country_name", "US")
                }
                break

        return NPIValidationResult(
            npi=npi,
            is_valid=True,
            provider_name=provider_name,
            provider_type=provider_type,
            credential=credential,
            specialty=specialty,
            practice_address=practice_address,
            enumeration_date=provider.get("basic", {}).get("enumeration_date"),
            last_updated=provider.get("basic", {}).get("last_updated"),
            status=provider.get("basic", {}).get("status", "active"),
            raw_response=provider
        )


# Global instance
_npi_validator: Optional[NPIValidator] = None


def get_npi_validator() -> NPIValidator:
    """Get or create the global NPI validator instance."""
    global _npi_validator
    if _npi_validator is None:
        _npi_validator = NPIValidator()
    return _npi_validator
