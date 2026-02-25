"""Azure OpenAI client - fallback for general tasks."""
import json
import time
from typing import Dict, Any, Optional

from openai import AsyncAzureOpenAI, APIConnectionError, RateLimitError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from backend.config.settings import get_settings
from backend.config.logging_config import get_logger
from backend.config.request_context import get_correlation_id

logger = get_logger(__name__)

# Azure OpenAI pricing per 1M tokens (gpt-4o)
_AZURE_PRICING = {
    "input": 2.50 / 1_000_000,   # $2.50/1M input tokens
    "output": 10.00 / 1_000_000,  # $10/1M output tokens
}


class AzureOpenAIError(Exception):
    """Error in Azure OpenAI API call."""
    pass


class AzureOpenAIClient:
    """
    Azure OpenAI client for general tasks.
    Used as fallback when Gemini fails.
    """

    def __init__(self):
        """Initialize the Azure OpenAI client."""
        settings = get_settings()
        self.client = AsyncAzureOpenAI(
            api_key=settings.azure_openai_api_key,
            api_version=settings.azure_openai_api_version,
            azure_endpoint=settings.azure_openai_endpoint,
            timeout=180.0
        )
        self.deployment = settings.azure_openai_deployment
        self.max_tokens = settings.azure_max_output_tokens
        logger.info("Azure OpenAI client initialized", deployment=self.deployment)

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((APIConnectionError, RateLimitError)),
        reraise=True
    )
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        response_format: str = "text"
    ) -> Dict[str, Any]:
        """
        Generate content using Azure OpenAI.

        Args:
            prompt: The generation prompt
            system_prompt: Optional system instruction
            temperature: Temperature for generation
            response_format: Expected format ("json" or "text")

        Returns:
            Generated response

        Raises:
            AzureOpenAIError: If generation fails
        """
        logger.info("Generating with Azure OpenAI", deployment=self.deployment)

        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            # Build request params - some models (gpt-5-mini) don't support temperature
            request_params = {
                "model": self.deployment,
                "messages": messages,
                "max_completion_tokens": self.max_tokens,
            }
            if response_format == "json":
                request_params["response_format"] = {"type": "json_object"}
            # Only set temperature if not using a model that doesn't support it
            if "mini" not in self.deployment.lower():
                request_params["temperature"] = temperature

            start_time = time.monotonic()
            response = await self.client.chat.completions.create(**request_params)
            latency_ms = (time.monotonic() - start_time) * 1000

            if not response.choices:
                raise AzureOpenAIError("No choices in Azure OpenAI response")

            choice = response.choices[0]
            finish_reason = choice.finish_reason
            response_text = choice.message.content

            # Log diagnostics for debugging
            usage = response.usage
            input_tokens = usage.prompt_tokens if usage else 0
            output_tokens = usage.completion_tokens if usage else 0
            logger.info(
                "Azure OpenAI response received",
                finish_reason=finish_reason,
                content_length=len(response_text) if response_text else 0,
                prompt_tokens=input_tokens,
                completion_tokens=output_tokens,
            )

            # Record token usage
            await self._record_usage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                task_category="general",
            )

            if finish_reason == "content_filter":
                raise AzureOpenAIError(
                    "Azure content filter blocked the response"
                )

            if finish_reason == "length" and (not response_text):
                raise AzureOpenAIError(
                    f"Response truncated at {self.max_tokens} tokens (finish_reason=length). "
                    f"Prompt used {usage.prompt_tokens if usage else '?'} tokens. "
                    f"Increase AZURE_MAX_OUTPUT_TOKENS."
                )

            if not response_text:
                refusal = getattr(choice.message, 'refusal', None)
                raise AzureOpenAIError(
                    f"Empty response from Azure OpenAI "
                    f"(finish_reason={finish_reason}, refusal={refusal})"
                )

            logger.debug("Azure OpenAI response received", length=len(response_text))

            _usage_meta = {
                "input_tokens": input_tokens, "output_tokens": output_tokens,
                "latency_ms": round(latency_ms, 2), "model": self.deployment,
            }

            if response_format == "json":
                parsed = json.loads(response_text)
                parsed["_usage"] = _usage_meta
                return parsed
            else:
                return {"response": response_text, "_usage": _usage_meta}

        except json.JSONDecodeError as e:
            logger.error("Failed to parse Azure OpenAI response as JSON", error=str(e))
            raise AzureOpenAIError(f"Invalid JSON response: {e}") from e
        except Exception as e:
            logger.error("Azure OpenAI generation failed", error=str(e))
            raise AzureOpenAIError(f"Azure OpenAI generation failed: {e}") from e

    async def _record_usage(
        self,
        input_tokens: int,
        output_tokens: int,
        latency_ms: float,
        task_category: str = "general",
        case_id: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> None:
        """Record LLM token usage and cost to the database (non-fatal)."""
        try:
            from uuid import uuid4
            from backend.storage.database import get_db
            from backend.storage.models import LLMUsageModel

            cost = (input_tokens * _AZURE_PRICING["input"] +
                    output_tokens * _AZURE_PRICING["output"])

            record = LLMUsageModel(
                id=str(uuid4()),
                case_id=case_id,
                correlation_id=correlation_id or get_correlation_id(),
                provider="azure_openai",
                model=self.deployment,
                task_category=task_category,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=round(cost, 6),
                latency_ms=round(latency_ms, 2),
            )
            async with get_db() as session:
                session.add(record)
        except Exception as e:
            logger.debug("Failed to record LLM usage (non-fatal)", error=str(e))

    async def summarize(self, text: str, max_length: int = 500) -> str:
        """
        Summarize text using Azure OpenAI.

        Args:
            text: Text to summarize
            max_length: Maximum summary length

        Returns:
            Summary text
        """
        from backend.reasoning.prompt_loader import get_prompt_loader
        prompt = get_prompt_loader().load(
            "general/summarize.txt",
            {"max_length": max_length, "text": text}
        )

        result = await self.generate(prompt, temperature=0.2, response_format="text")
        return result.get("response", "")

    async def extract_data(
        self,
        text: str,
        extraction_schema: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extract structured data from text.

        Args:
            text: Text to extract from
            extraction_schema: JSON schema defining what to extract

        Returns:
            Extracted data matching schema
        """
        from backend.reasoning.prompt_loader import get_prompt_loader
        prompt = get_prompt_loader().load(
            "general/extract_data.txt",
            {"extraction_schema": extraction_schema, "text": text}
        )

        result = await self.generate(prompt, temperature=0.1, response_format="json")
        return result

    async def draft_notification(
        self,
        notification_type: str,
        context: Dict[str, Any]
    ) -> str:
        """
        Draft a notification message.

        Args:
            notification_type: Type of notification
            context: Context for the notification

        Returns:
            Drafted notification text
        """
        from backend.reasoning.prompt_loader import get_prompt_loader
        prompt = get_prompt_loader().load(
            "general/draft_notification.txt",
            {"notification_type": notification_type, "context": context}
        )

        result = await self.generate(prompt, temperature=0.3, response_format="text")
        return result.get("response", "")

    async def health_check(self) -> bool:
        """Check if Azure OpenAI API is accessible."""
        try:
            response = await self.client.chat.completions.create(
                model=self.deployment,
                messages=[{"role": "user", "content": "Reply with 'ok'"}],
                max_completion_tokens=10
            )
            content = response.choices[0].message.content if response.choices else None
            return bool(content) and "ok" in content.lower()
        except Exception as e:
            logger.error("Azure OpenAI health check failed", error=str(e))
            return False
