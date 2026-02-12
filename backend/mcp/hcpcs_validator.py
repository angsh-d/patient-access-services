"""HCPCS/J-Code validation using LLM-first approach.

Validates HCPCS Level II codes (J-codes, Q-codes, etc.) against known
drug/procedure coding standards using LLM knowledge as primary source.
No reliable free public API exists for HCPCS, so we use the LLM gateway.
"""

import json
from typing import List, Optional
from dataclasses import dataclass, field

from backend.models.enums import TaskCategory
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class HCPCSCodeInfo:
    """Information about an HCPCS/J-Code."""
    code: str
    is_valid: bool
    description: Optional[str] = None
    drug_name: Optional[str] = None
    billing_notes: Optional[str] = None
    status: str = "validated"  # validated | needs_review | invalid
    errors: List[str] = field(default_factory=list)


@dataclass
class HCPCSValidationResult:
    """Result of validating multiple HCPCS codes."""
    codes: List[HCPCSCodeInfo]
    all_valid: bool
    valid_count: int
    invalid_count: int
    needs_review_count: int = 0
    errors: List[str] = field(default_factory=list)


class HCPCSValidator:
    """
    Validates HCPCS Level II codes using LLM-first approach.

    Uses the LLM gateway (routed via TaskCategory.DATA_EXTRACTION)
    to validate J-codes/Q-codes against known drug coding knowledge.
    """

    def __init__(self):
        """Initialize the HCPCS validator."""
        logger.info("HCPCS Validator initialized")

    async def validate_code(
        self,
        code: str,
        medication_context: Optional[str] = None
    ) -> HCPCSCodeInfo:
        """
        Validate a single HCPCS/J-Code.

        Args:
            code: HCPCS code (e.g., "Q5103", "J1745")
            medication_context: Optional medication name for cross-reference

        Returns:
            HCPCSCodeInfo with validation details
        """
        from backend.reasoning.llm_gateway import get_llm_gateway
        from backend.reasoning.prompt_loader import get_prompt_loader

        logger.debug("Validating HCPCS code", code=code, medication_context=medication_context)

        normalized = code.upper().strip()

        # Basic format check
        if not self._is_valid_format(normalized):
            return HCPCSCodeInfo(
                code=code,
                is_valid=False,
                status="invalid",
                errors=["Invalid HCPCS code format. Expected pattern: letter followed by 4 digits (e.g., J1745, Q5103)"]
            )

        try:
            prompt_loader = get_prompt_loader()
            prompt = prompt_loader.load(
                "validation/hcpcs_validation.txt",
                {
                    "code": normalized,
                    "medication_context": medication_context or "Not provided"
                }
            )

            gateway = get_llm_gateway()
            result = await gateway.generate(
                task_category=TaskCategory.DATA_EXTRACTION,
                prompt=prompt,
                temperature=0.0,
                response_format="json"
            )

            return self._parse_llm_response(code, result)

        except Exception as e:
            logger.error("HCPCS validation failed", code=code, error=str(e))
            return HCPCSCodeInfo(
                code=code,
                is_valid=False,
                status="needs_review",
                errors=[f"Validation service error: {str(e)}"]
            )

    async def validate_batch(
        self,
        codes: List[str],
        medication_context: Optional[str] = None
    ) -> HCPCSValidationResult:
        """
        Validate multiple HCPCS codes concurrently.

        Args:
            codes: List of HCPCS codes
            medication_context: Optional medication name for cross-reference

        Returns:
            HCPCSValidationResult with all code validations
        """
        import asyncio

        logger.info("Validating HCPCS batch", count=len(codes))

        tasks = [self.validate_code(code, medication_context) for code in codes]
        validation_results = await asyncio.gather(*tasks, return_exceptions=True)

        code_infos = []
        for code, result in zip(codes, validation_results):
            if isinstance(result, Exception):
                code_infos.append(HCPCSCodeInfo(
                    code=code,
                    is_valid=False,
                    status="needs_review",
                    errors=[f"Validation error: {str(result)}"]
                ))
            else:
                code_infos.append(result)

        valid_count = sum(1 for c in code_infos if c.is_valid)
        needs_review = sum(1 for c in code_infos if c.status == "needs_review")
        invalid_count = len(code_infos) - valid_count - needs_review

        return HCPCSValidationResult(
            codes=code_infos,
            all_valid=invalid_count == 0 and needs_review == 0,
            valid_count=valid_count,
            invalid_count=invalid_count,
            needs_review_count=needs_review,
            errors=[
                f"Code issue: {c.code} - {', '.join(c.errors)}"
                for c in code_infos if not c.is_valid
            ]
        )

    def _is_valid_format(self, code: str) -> bool:
        """Check if code has valid HCPCS Level II format."""
        if len(code) != 5:
            return False
        if not code[0].isalpha():
            return False
        if not code[1:].isdigit():
            return False
        return True

    def _parse_llm_response(self, original_code: str, result: dict) -> HCPCSCodeInfo:
        """Parse LLM gateway response into HCPCSCodeInfo.

        With response_format="json", both Gemini and Azure OpenAI return the
        parsed dict directly. The gateway adds 'provider' and 'task_category' keys.
        """
        try:
            status = result.get("status", "validated")
            if status == "needs_review":
                is_valid = True  # Tentatively valid but flagged for review
            else:
                is_valid = result.get("is_valid", False)

            return HCPCSCodeInfo(
                code=original_code,
                is_valid=is_valid,
                description=result.get("description"),
                drug_name=result.get("associated_drug"),
                billing_notes=result.get("billing_notes"),
                status=status,
                errors=result.get("errors", [])
            )

        except (KeyError, TypeError, AttributeError) as e:
            logger.warning("Failed to parse HCPCS LLM response", code=original_code, error=str(e))
            return HCPCSCodeInfo(
                code=original_code,
                is_valid=False,
                status="needs_review",
                errors=[f"Could not parse validation response: {str(e)}"]
            )


# Global instance
_hcpcs_validator: Optional[HCPCSValidator] = None


def get_hcpcs_validator() -> HCPCSValidator:
    """Get or create the global HCPCS validator instance."""
    global _hcpcs_validator
    if _hcpcs_validator is None:
        _hcpcs_validator = HCPCSValidator()
    return _hcpcs_validator
