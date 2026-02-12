"""Request-scoped context variables for distributed tracing."""
from contextvars import ContextVar
from typing import Optional

# Correlation ID for request tracing across services and LLM calls.
# Set by the CorrelationID middleware on each incoming request.
correlation_id_var: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)


def get_correlation_id() -> Optional[str]:
    """Return the current request's correlation ID, or None if outside a request."""
    return correlation_id_var.get()
