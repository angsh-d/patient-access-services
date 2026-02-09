"""Policy digitalization exceptions — stub for Patient Services.

The full pipeline lives in the PDI project. PS only needs the exception
classes that are referenced by shared modules (e.g., policy_reasoner).
"""


class PolicyNotFoundError(Exception):
    """Raised when a requested policy is not found in the database."""
    pass


class ExtractionError(Exception):
    """Error during policy extraction."""
    pass


class ValidationError(Exception):
    """Error during extraction validation."""
    pass


class EvaluationError(Exception):
    """Error during criteria evaluation."""
    pass
