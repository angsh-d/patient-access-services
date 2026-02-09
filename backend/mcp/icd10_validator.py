"""ICD-10 code validation using NLM Clinical Tables API.

This module validates ICD-10 diagnosis codes against the official clinical coding database.
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field

from backend.mcp.mcp_client import get_mcp_client
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class ICD10CodeInfo:
    """Information about an ICD-10 code."""
    code: str
    is_valid: bool
    description: Optional[str] = None
    long_description: Optional[str] = None
    category: Optional[str] = None
    chapter: Optional[str] = None
    is_billable: bool = True
    errors: List[str] = field(default_factory=list)


@dataclass
class ICD10ValidationResult:
    """Result of validating multiple ICD-10 codes."""
    codes: List[ICD10CodeInfo]
    all_valid: bool
    valid_count: int
    invalid_count: int
    errors: List[str] = field(default_factory=list)


class ICD10Validator:
    """
    Validates ICD-10 diagnosis codes using NLM Clinical Tables API.

    Uses the National Library of Medicine Clinical Tables API:
    https://clinicaltables.nlm.nih.gov/
    """

    def __init__(self):
        """Initialize the ICD-10 validator."""
        self._client = get_mcp_client()
        logger.info("ICD-10 Validator initialized")

    async def validate_code(self, code: str) -> ICD10CodeInfo:
        """
        Validate a single ICD-10 code.

        Args:
            code: ICD-10-CM diagnosis code (e.g., "K50.00", "M05.79")

        Returns:
            ICD10CodeInfo with code details or errors
        """
        logger.debug("Validating ICD-10 code", code=code)

        # Normalize code format
        normalized_code = self._normalize_code(code)

        # Basic format validation
        if not self._is_valid_format(normalized_code):
            return ICD10CodeInfo(
                code=code,
                is_valid=False,
                errors=["Invalid ICD-10 code format"]
            )

        try:
            # Query NLM Clinical Tables API
            response = await self._client.call(
                server="icd10",
                endpoint="/icd10cm/v3/search",
                params={
                    "sf": "code",
                    "terms": normalized_code,
                    "maxList": 10
                }
            )

            return self._parse_code_response(code, normalized_code, response)

        except Exception as e:
            logger.error("ICD-10 validation failed", code=code, error=str(e))
            return ICD10CodeInfo(
                code=code,
                is_valid=False,
                errors=[f"Validation service error: {str(e)}"]
            )

    async def validate_batch(self, codes: List[str]) -> ICD10ValidationResult:
        """
        Validate multiple ICD-10 codes concurrently.

        Args:
            codes: List of ICD-10-CM diagnosis codes

        Returns:
            ICD10ValidationResult with all code validations
        """
        import asyncio

        logger.info("Validating ICD-10 batch", count=len(codes))

        # Validate all codes concurrently
        tasks = [self.validate_code(code) for code in codes]
        validation_results = await asyncio.gather(*tasks, return_exceptions=True)

        code_infos = []
        for code, result in zip(codes, validation_results):
            if isinstance(result, Exception):
                code_infos.append(ICD10CodeInfo(
                    code=code,
                    is_valid=False,
                    errors=[f"Validation error: {str(result)}"]
                ))
            else:
                code_infos.append(result)

        valid_count = sum(1 for c in code_infos if c.is_valid)
        invalid_count = len(code_infos) - valid_count

        return ICD10ValidationResult(
            codes=code_infos,
            all_valid=invalid_count == 0,
            valid_count=valid_count,
            invalid_count=invalid_count,
            errors=[
                f"Invalid code: {c.code} - {', '.join(c.errors)}"
                for c in code_infos if not c.is_valid
            ]
        )

    async def search_codes(self, query: str, max_results: int = 20) -> List[ICD10CodeInfo]:
        """
        Search for ICD-10 codes by description or partial code.

        Args:
            query: Search term (code or description text)
            max_results: Maximum number of results to return

        Returns:
            List of matching ICD-10 codes
        """
        logger.debug("Searching ICD-10 codes", query=query)

        try:
            response = await self._client.call(
                server="icd10",
                endpoint="/icd10cm/v3/search",
                params={
                    "terms": query,
                    "maxList": max_results
                }
            )

            return self._parse_search_response(response)

        except Exception as e:
            logger.error("ICD-10 search failed", query=query, error=str(e))
            return []

    def _normalize_code(self, code: str) -> str:
        """Normalize ICD-10 code format (add dot if missing)."""
        code = code.upper().strip()

        # Add decimal point if missing and code is long enough
        if len(code) > 3 and "." not in code:
            code = code[:3] + "." + code[3:]

        return code

    def _is_valid_format(self, code: str) -> bool:
        """Check if code has valid ICD-10-CM format."""
        # Basic pattern: Letter followed by 2 digits, optional decimal, optional more chars
        if len(code) < 3:
            return False

        # First character must be a letter
        if not code[0].isalpha():
            return False

        # Characters 2-3 must be digits
        if not code[1:3].isdigit():
            return False

        return True

    def _parse_code_response(
        self,
        original_code: str,
        normalized_code: str,
        response: Any
    ) -> ICD10CodeInfo:
        """Parse NLM API response for code validation."""
        # NLM API returns: [total_count, [codes], null, [[code, description],...]]
        if not isinstance(response, list) or len(response) < 4:
            return ICD10CodeInfo(
                code=original_code,
                is_valid=False,
                errors=["Invalid API response format"]
            )

        total_count = response[0]
        codes = response[1] if len(response) > 1 else []
        details = response[3] if len(response) > 3 else []

        # Check if exact code match exists
        code_upper = normalized_code.upper().replace(".", "")
        for i, code_item in enumerate(codes):
            item_upper = code_item.upper().replace(".", "")
            if item_upper == code_upper:
                # Found exact match
                description = details[i][1] if i < len(details) and len(details[i]) > 1 else ""
                return ICD10CodeInfo(
                    code=original_code,
                    is_valid=True,
                    description=description,
                    long_description=description,
                    category=self._get_category(normalized_code),
                    is_billable=len(normalized_code.replace(".", "")) >= 4
                )

        # No exact match found
        return ICD10CodeInfo(
            code=original_code,
            is_valid=False,
            errors=[f"Code not found in ICD-10-CM database. Found {total_count} similar codes."]
        )

    def _parse_search_response(self, response: Any) -> List[ICD10CodeInfo]:
        """Parse NLM API response for code search."""
        if not isinstance(response, list) or len(response) < 4:
            return []

        codes = response[1] if len(response) > 1 else []
        details = response[3] if len(response) > 3 else []

        results = []
        for i, code in enumerate(codes):
            description = details[i][1] if i < len(details) and len(details[i]) > 1 else ""
            results.append(ICD10CodeInfo(
                code=code,
                is_valid=True,
                description=description,
                long_description=description,
                category=self._get_category(code),
                is_billable=len(code.replace(".", "")) >= 4
            ))

        return results

    def _get_category(self, code: str) -> str:
        """Get ICD-10 category from code prefix."""
        if not code:
            return "Unknown"

        prefix = code[0].upper()

        categories = {
            "A": "Certain infectious and parasitic diseases",
            "B": "Certain infectious and parasitic diseases",
            "C": "Neoplasms",
            "D": "Diseases of blood and immune mechanism",
            "E": "Endocrine, nutritional and metabolic diseases",
            "F": "Mental and behavioral disorders",
            "G": "Diseases of the nervous system",
            "H": "Diseases of eye/ear",
            "I": "Diseases of the circulatory system",
            "J": "Diseases of the respiratory system",
            "K": "Diseases of the digestive system",
            "L": "Diseases of the skin",
            "M": "Diseases of the musculoskeletal system",
            "N": "Diseases of the genitourinary system",
            "O": "Pregnancy, childbirth and puerperium",
            "P": "Conditions in the perinatal period",
            "Q": "Congenital malformations",
            "R": "Symptoms and abnormal findings",
            "S": "Injury and poisoning",
            "T": "Injury and poisoning",
            "V": "External causes of morbidity",
            "W": "External causes of morbidity",
            "X": "External causes of morbidity",
            "Y": "External causes of morbidity",
            "Z": "Factors influencing health status"
        }

        return categories.get(prefix, "Other")


# Global instance
_icd10_validator: Optional[ICD10Validator] = None


def get_icd10_validator() -> ICD10Validator:
    """Get or create the global ICD-10 validator instance."""
    global _icd10_validator
    if _icd10_validator is None:
        _icd10_validator = ICD10Validator()
    return _icd10_validator
