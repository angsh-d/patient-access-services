"""Langfuse observability integration — singleton client, trace wrappers, prompt utilities."""
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from backend.config.logging_config import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Singleton Langfuse client
# ---------------------------------------------------------------------------
_langfuse_client = None
_langfuse_available = False


def _init_langfuse() -> None:
    """Initialize the Langfuse singleton. Safe to call multiple times."""
    global _langfuse_client, _langfuse_available
    try:
        from backend.config.settings import get_settings
        settings = get_settings()
        if not settings.langfuse_secret_key or not settings.langfuse_public_key:
            logger.info("Langfuse not configured — credentials missing")
            return

        from langfuse import Langfuse
        _langfuse_client = Langfuse(
            secret_key=settings.langfuse_secret_key,
            public_key=settings.langfuse_public_key,
            host=settings.langfuse_base_url,
        )
        _langfuse_client.auth_check()
        _langfuse_available = True
        logger.info("Langfuse initialized", host=settings.langfuse_base_url)
    except Exception as e:
        _langfuse_client = None
        _langfuse_available = False
        logger.warning("Langfuse unavailable", error=str(e))


def get_langfuse():
    """Return the Langfuse client (may be None)."""
    return _langfuse_client


def is_langfuse_available() -> bool:
    return _langfuse_available


def shutdown_langfuse() -> None:
    """Flush pending events and shut down."""
    global _langfuse_client, _langfuse_available
    if _langfuse_client is not None:
        try:
            _langfuse_client.flush()
            _langfuse_client.shutdown()
            logger.info("Langfuse shut down")
        except Exception as e:
            logger.debug("Langfuse shutdown error", error=str(e))
    _langfuse_client = None
    _langfuse_available = False


# ---------------------------------------------------------------------------
# Trace / Generation wrappers — no-op when Langfuse is unavailable
# ---------------------------------------------------------------------------
# Langfuse SDK v3 API:
#   client.start_span(trace_context={"trace_id": ...}, name=...) → LangfuseSpan
#   span.start_generation(name=..., model=...) → LangfuseGeneration
#   generation.update(output=..., usage_details=..., level=...)
#   generation.end()
#   span.update(output=..., metadata=...)
#   span.end()

@dataclass
class WrappedGeneration:
    """Wraps a Langfuse generation span; degrades to no-op."""
    _gen: Any = None

    def end(self, output: Optional[str] = None, usage: Optional[Dict] = None,
            level: str = "DEFAULT", metadata: Optional[Dict] = None) -> None:
        if self._gen is None:
            return
        try:
            update_kwargs: Dict[str, Any] = {}
            if output is not None:
                update_kwargs["output"] = output[:2000]
            if usage:
                update_kwargs["usage_details"] = usage
            if level != "DEFAULT":
                update_kwargs["level"] = level
            if metadata:
                update_kwargs["metadata"] = metadata
            if update_kwargs:
                self._gen.update(**update_kwargs)
            self._gen.end()
        except Exception as e:
            logger.debug("Langfuse generation.end failed", error=str(e))


@dataclass
class WrappedTrace:
    """Wraps a Langfuse top-level span (trace); degrades to no-op."""
    _span: Any = None
    _trace_context: Optional[Dict] = None

    def create_generation(
        self, name: str, model: Optional[str] = None,
        input_data: Optional[str] = None, metadata: Optional[Dict] = None,
    ) -> WrappedGeneration:
        if self._span is None:
            return WrappedGeneration()
        try:
            kwargs: Dict[str, Any] = {"name": name}
            if model:
                kwargs["model"] = model
            if input_data:
                kwargs["input"] = input_data[:2000]
            if metadata:
                kwargs["metadata"] = metadata
            gen = self._span.start_generation(**kwargs)
            return WrappedGeneration(_gen=gen)
        except Exception as e:
            logger.debug("Langfuse start_generation failed", error=str(e))
            return WrappedGeneration()

    def update(self, output: Optional[str] = None, metadata: Optional[Dict] = None) -> None:
        if self._span is None:
            return
        try:
            kwargs: Dict[str, Any] = {}
            if output is not None:
                kwargs["output"] = output[:2000]
            if metadata:
                kwargs["metadata"] = metadata
            if kwargs:
                self._span.update(**kwargs)
            self._span.end()
        except Exception as e:
            logger.debug("Langfuse trace.update failed", error=str(e))


# Backwards-compatible aliases used by llm_gateway
LangfuseTrace = WrappedTrace
LangfuseGeneration = WrappedGeneration


def create_trace(
    name: str,
    trace_id: Optional[str] = None,
    metadata: Optional[Dict] = None,
    input_data: Optional[str] = None,
    tags: Optional[list] = None,
) -> WrappedTrace:
    """Create a Langfuse trace as a top-level span (no-op wrapper when unavailable)."""
    client = get_langfuse()
    if client is None:
        return WrappedTrace()
    try:
        # Langfuse requires 32 lowercase hex chars; strip hyphens from UUIDs
        clean_id = trace_id.replace("-", "").lower() if trace_id else None
        trace_context = {"trace_id": clean_id} if clean_id else None
        kwargs: Dict[str, Any] = {"name": name}
        if trace_context:
            kwargs["trace_context"] = trace_context
        if metadata:
            kwargs["metadata"] = metadata
        if input_data:
            kwargs["input"] = input_data[:2000]
        span = client.start_span(**kwargs)
        return WrappedTrace(_span=span, _trace_context=trace_context)
    except Exception as e:
        logger.debug("Langfuse create_trace failed", error=str(e))
        return WrappedTrace()


# ---------------------------------------------------------------------------
# Prompt naming utilities
# ---------------------------------------------------------------------------

def prompt_path_to_langfuse_name(path: str) -> str:
    """Convert 'policy_analysis/coverage_assessment.txt' → 'policy_analysis--coverage_assessment'."""
    name = path.replace("/", "--").replace("\\", "--")
    if name.endswith(".txt"):
        name = name[:-4]
    return name


def local_to_langfuse_syntax(text: str) -> str:
    """Convert local {var} placeholders to Langfuse {{var}} syntax."""
    return re.sub(r"(?<!\{)\{(\w+)\}(?!\})", r"{{\1}}", text)


def langfuse_to_local_syntax(text: str) -> str:
    """Convert Langfuse {{var}} placeholders to local {var} syntax."""
    return re.sub(r"\{\{(\w+)\}\}", r"{\1}", text)
