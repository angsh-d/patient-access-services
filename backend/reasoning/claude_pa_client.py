"""Claude client for policy reasoning - NO FALLBACK."""
import json
import time
from typing import Dict, Any, Optional

import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from backend.config.settings import get_settings
from backend.config.logging_config import get_logger
from backend.config.request_context import get_correlation_id
from backend.reasoning.json_utils import extract_json_from_text

logger = get_logger(__name__)

# Claude pricing per 1M tokens (as of 2025 — claude-sonnet-4-20250514)
_CLAUDE_PRICING = {
    "input": 3.00 / 1_000_000,   # $3/1M input tokens
    "output": 15.00 / 1_000_000,  # $15/1M output tokens
}


class ClaudePolicyReasoningError(Exception):
    """Error in Claude policy reasoning - critical, no fallback allowed."""
    pass


class ClaudePAClient:
    """
    Claude client specialized for prior authorization policy reasoning.

    CRITICAL: This client has NO FALLBACK. If Claude fails, the error propagates.
    This is intentional for clinical accuracy - we cannot substitute with less
    capable models for policy reasoning tasks.
    """

    def __init__(self):
        """Initialize the Claude PA client."""
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=180.0
        )
        self.model = settings.claude_model
        self.max_tokens = settings.claude_max_output_tokens
        logger.info("Claude PA client initialized", model=self.model)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((anthropic.APIConnectionError, anthropic.RateLimitError)),
        reraise=True
    )
    async def _make_api_call(self, temperature: float, system: str, prompt: str):
        """Inner method that tenacity retries on transient errors."""
        return await self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": prompt}]
        )

    async def analyze_policy(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.0,
        response_format: str = "json"
    ) -> Dict[str, Any]:
        """
        Analyze a policy using Claude.

        CRITICAL: No fallback. Errors propagate.

        Args:
            prompt: The analysis prompt with all context
            system_prompt: Optional system prompt override
            temperature: Temperature for generation (default: 0.0 for deterministic clinical reasoning)
            response_format: Expected response format ("json" or "text")

        Returns:
            Parsed response from Claude

        Raises:
            ClaudePolicyReasoningError: If analysis fails
        """
        logger.info("Starting policy analysis with Claude", model=self.model)

        from backend.reasoning.prompt_loader import get_prompt_loader
        default_system = get_prompt_loader().load("system/clinical_reasoning_base.txt")

        try:
            start_time = time.monotonic()
            message = await self._make_api_call(
                temperature=temperature,
                system=system_prompt or default_system,
                prompt=prompt
            )
            latency_ms = (time.monotonic() - start_time) * 1000

            if not message.content:
                raise ClaudePolicyReasoningError("Empty response from Claude (no content blocks)")

            response_text = message.content[0].text

            # Record token usage
            usage = getattr(message, 'usage', None)
            input_tokens = getattr(usage, 'input_tokens', 0) if usage else 0
            output_tokens = getattr(usage, 'output_tokens', 0) if usage else 0
            await self._record_usage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                task_category="policy_reasoning",
            )

            logger.debug("Claude response received", length=len(response_text),
                         input_tokens=input_tokens, output_tokens=output_tokens)

            _usage_meta = {
                "input_tokens": input_tokens, "output_tokens": output_tokens,
                "latency_ms": round(latency_ms, 2), "model": self.model,
            }

            if response_format == "json":
                parsed = self._extract_json(response_text)
                parsed["_usage"] = _usage_meta
                return parsed
            else:
                return {"response": response_text, "_usage": _usage_meta}

        except anthropic.APIConnectionError as e:
            logger.error("Claude API connection error", error=str(e))
            raise ClaudePolicyReasoningError(f"Claude API connection failed: {e}") from e
        except anthropic.RateLimitError as e:
            logger.error("Claude rate limit exceeded", error=str(e))
            raise ClaudePolicyReasoningError(f"Claude rate limit exceeded: {e}") from e
        except anthropic.APIStatusError as e:
            logger.error("Claude API error", status_code=e.status_code, error=str(e))
            raise ClaudePolicyReasoningError(f"Claude API error ({e.status_code}): {e}") from e
        except json.JSONDecodeError as e:
            logger.error("Failed to parse Claude response as JSON", error=str(e))
            raise ClaudePolicyReasoningError(f"Invalid JSON response from Claude: {e}") from e
        except Exception as e:
            logger.error("Unexpected error in Claude policy analysis", error=str(e))
            raise ClaudePolicyReasoningError(f"Policy analysis failed: {e}") from e

    async def generate_appeal_strategy(
        self,
        denial_context: Dict[str, Any],
        patient_info: Dict[str, Any],
        policy_text: str
    ) -> Dict[str, Any]:
        """
        Generate an appeal strategy using Claude.

        CRITICAL: No fallback. Clinical accuracy required.

        Args:
            denial_context: Information about the denial
            patient_info: Patient clinical information
            policy_text: Relevant policy text

        Returns:
            Appeal strategy recommendations
        """
        from backend.reasoning.prompt_loader import get_prompt_loader

        prompt_loader = get_prompt_loader()
        prompt = prompt_loader.load(
            "appeals/appeal_strategy.txt",
            {
                "denial_details": denial_context,
                "patient_profile": patient_info,
                "policy_document": policy_text,
                "original_request": denial_context.get("original_request", {}),
                "available_documentation": denial_context.get("available_documentation", [])
            }
        )

        return await self.analyze_policy(prompt, response_format="json")

    async def _record_usage(
        self,
        input_tokens: int,
        output_tokens: int,
        latency_ms: float,
        task_category: str = "policy_reasoning",
        case_id: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> None:
        """Record LLM token usage and cost to the database (non-fatal)."""
        try:
            from uuid import uuid4
            from backend.storage.database import get_db
            from backend.storage.models import LLMUsageModel

            cost = (input_tokens * _CLAUDE_PRICING["input"] +
                    output_tokens * _CLAUDE_PRICING["output"])

            record = LLMUsageModel(
                id=str(uuid4()),
                case_id=case_id,
                correlation_id=correlation_id or get_correlation_id(),
                provider="claude",
                model=self.model,
                task_category=task_category,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=round(cost, 6),
                latency_ms=round(latency_ms, 2),
            )
            async with get_db() as session:
                session.add(record)

            logger.debug(
                "LLM usage recorded",
                provider="claude",
                correlation_id=record.correlation_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=round(cost, 6),
            )
        except Exception as e:
            logger.debug("Failed to record LLM usage (non-fatal)", error=str(e))

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extract JSON from response text using shared utility."""
        return extract_json_from_text(text)

    async def health_check(self) -> bool:
        """Check if Claude API is accessible."""
        try:
            message = await self.client.messages.create(
                model=self.model,
                max_tokens=10,
                messages=[{"role": "user", "content": "Reply with 'ok'"}]
            )
            return bool(message.content) and "ok" in message.content[0].text.lower()
        except Exception as e:
            logger.error("Claude health check failed", error=str(e))
            return False
