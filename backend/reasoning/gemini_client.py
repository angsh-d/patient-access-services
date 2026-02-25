"""Gemini client for general tasks - primary model with Azure fallback."""
import json
import time
from typing import Dict, Any, Optional, List

import google.generativeai as genai
from google.api_core.exceptions import (
    GoogleAPIError,
    ServiceUnavailable,
    TooManyRequests,
    DeadlineExceeded,
)
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from backend.config.settings import get_settings
from backend.config.logging_config import get_logger
from backend.config.request_context import get_correlation_id
from backend.reasoning.json_utils import extract_json_from_text

logger = get_logger(__name__)

# Gemini pricing per 1M tokens (gemini-2.5-pro range)
_GEMINI_PRICING = {
    "input": 1.25 / 1_000_000,   # $1.25/1M input tokens
    "output": 10.00 / 1_000_000,  # $10/1M output tokens
}


class GeminiError(Exception):
    """Error in Gemini API call."""
    pass


class GeminiClient:
    """
    Gemini client for general tasks.
    Used as primary model for non-policy-reasoning tasks.
    Falls back to Azure OpenAI if Gemini fails.
    """

    def __init__(self):
        """Initialize the Gemini client."""
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        self.model_name = settings.gemini_model
        self.max_output_tokens = settings.gemini_max_output_tokens
        self.model = genai.GenerativeModel(self.model_name)
        logger.info("Gemini client initialized", model=self.model_name)

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((
            GoogleAPIError, ServiceUnavailable, TooManyRequests,
            DeadlineExceeded, ConnectionError, TimeoutError,
        )),
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
        Generate content using Gemini.

        Args:
            prompt: The generation prompt
            system_prompt: Optional system instruction
            temperature: Temperature for generation
            response_format: Expected format ("json" or "text")

        Returns:
            Generated response

        Raises:
            GeminiError: If generation fails
        """
        logger.info("Generating with Gemini", model=self.model_name)

        try:
            generation_config = genai.GenerationConfig(
                temperature=temperature,
                max_output_tokens=self.max_output_tokens,
                **({"response_mime_type": "application/json"} if response_format == "json" else {}),
            )

            start_time = time.monotonic()

            # Use system_instruction to separate system prompt from user input
            # This prevents prompt injection via user-controlled data
            if system_prompt:
                model_with_system = genai.GenerativeModel(
                    self.model_name,
                    system_instruction=system_prompt
                )
                response = await model_with_system.generate_content_async(
                    prompt,
                    generation_config=generation_config,
                    request_options={"timeout": 300}
                )
            else:
                response = await self.model.generate_content_async(
                    prompt,
                    generation_config=generation_config,
                    request_options={"timeout": 300}
                )

            latency_ms = (time.monotonic() - start_time) * 1000

            if not response.text:
                raise GeminiError("Empty response from Gemini")

            response_text = response.text

            # Record token usage from Gemini metadata
            usage_meta = getattr(response, 'usage_metadata', None)
            input_tokens = getattr(usage_meta, 'prompt_token_count', 0) if usage_meta else 0
            output_tokens = getattr(usage_meta, 'candidates_token_count', 0) if usage_meta else 0
            await self._record_usage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                task_category="general",
            )

            logger.debug("Gemini response received", length=len(response_text),
                         input_tokens=input_tokens, output_tokens=output_tokens)

            _usage_meta = {
                "input_tokens": input_tokens, "output_tokens": output_tokens,
                "latency_ms": round(latency_ms, 2), "model": self.model_name,
            }

            if response_format == "json":
                parsed = self._extract_json(response_text)
                parsed["_usage"] = _usage_meta
                return parsed
            else:
                return {"response": response_text, "_usage": _usage_meta}

        except Exception as e:
            logger.error("Gemini generation failed", error=str(e))
            raise GeminiError(f"Gemini generation failed: {e}") from e

    async def summarize(self, text: str, max_length: int = 500) -> str:
        """
        Summarize text using Gemini.

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
            notification_type: Type of notification (provider, patient, etc.)
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

            cost = (input_tokens * _GEMINI_PRICING["input"] +
                    output_tokens * _GEMINI_PRICING["output"])

            record = LLMUsageModel(
                id=str(uuid4()),
                case_id=case_id,
                correlation_id=correlation_id or get_correlation_id(),
                provider="gemini",
                model=self.model_name,
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

    async def embed(self, text: str, task_type: str = "SEMANTIC_SIMILARITY") -> List[float]:
        """
        Generate an embedding vector for the given text using Gemini embedding model.

        Args:
            text: Text to embed
            task_type: Embedding task type (SEMANTIC_SIMILARITY, RETRIEVAL_QUERY, etc.)

        Returns:
            List of 768 floats (embedding vector)
        """
        import asyncio
        try:
            result = await asyncio.to_thread(
                genai.embed_content,
                model="models/gemini-embedding-001",
                content=text,
                task_type=task_type,
                output_dimensionality=768,
            )
            return result["embedding"]
        except Exception as e:
            logger.error("Gemini embedding failed", error=str(e))
            raise GeminiError(f"Gemini embedding failed: {e}") from e

    async def embed_batch(self, texts: List[str], task_type: str = "SEMANTIC_SIMILARITY") -> List[List[float]]:
        """
        Generate embedding vectors for multiple texts in a single API call.

        Args:
            texts: List of texts to embed
            task_type: Embedding task type

        Returns:
            List of embedding vectors (each 768 floats)
        """
        import asyncio
        if not texts:
            return []
        try:
            result = await asyncio.to_thread(
                genai.embed_content,
                model="models/gemini-embedding-001",
                content=texts,
                task_type=task_type,
                output_dimensionality=768,
            )
            return result["embedding"]
        except Exception as e:
            logger.error("Gemini batch embedding failed", error=str(e), batch_size=len(texts))
            raise GeminiError(f"Gemini batch embedding failed: {e}") from e

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Extract JSON from response text using shared utility."""
        return extract_json_from_text(text)

    async def health_check(self) -> bool:
        """Check if Gemini API is accessible."""
        try:
            response = await self.model.generate_content_async(
                "Reply with 'ok'",
                generation_config=genai.GenerationConfig(max_output_tokens=10),
                request_options={"timeout": 10}
            )
            return "ok" in response.text.lower()
        except Exception as e:
            logger.error("Gemini health check failed", error=str(e))
            return False
