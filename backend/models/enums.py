"""Enumeration types for the Agentic Access Strategy Platform."""
from enum import Enum


class CaseStage(str, Enum):
    """Stages in the case processing workflow."""
    INTAKE = "intake"
    POLICY_ANALYSIS = "policy_analysis"
    AWAITING_HUMAN_DECISION = "awaiting_human_decision"  # Human gate after policy analysis
    STRATEGY_GENERATION = "strategy_generation"
    STRATEGY_SELECTION = "strategy_selection"
    ACTION_COORDINATION = "action_coordination"
    MONITORING = "monitoring"
    RECOVERY = "recovery"
    COMPLETED = "completed"
    FAILED = "failed"


class HumanDecisionAction(str, Enum):
    """Actions a human can take at decision gates."""
    APPROVE = "approve"  # Approve AI recommendation
    REJECT = "reject"  # Reject AI recommendation
    OVERRIDE = "override"  # Override with different decision
    ESCALATE = "escalate"  # Escalate to senior reviewer


class PayerStatus(str, Enum):
    """Status of a prior authorization request with a payer."""
    NOT_SUBMITTED = "not_submitted"
    SUBMITTED = "submitted"
    PENDING_INFO = "pending_info"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    DENIED = "denied"
    APPEAL_SUBMITTED = "appeal_submitted"
    APPEAL_APPROVED = "appeal_approved"
    APPEAL_DENIED = "appeal_denied"


class TaskCategory(str, Enum):
    """Categories of LLM tasks for model routing."""
    POLICY_REASONING = "policy_reasoning"
    APPEAL_STRATEGY = "appeal_strategy"
    APPEAL_DRAFTING = "appeal_drafting"
    SUMMARY_GENERATION = "summary_generation"
    DATA_EXTRACTION = "data_extraction"
    NOTIFICATION = "notification"
    POLICY_QA = "policy_qa"


class LLMProvider(str, Enum):
    """Available LLM providers."""
    CLAUDE = "claude"
    GEMINI = "gemini"
    AZURE_OPENAI = "azure_openai"


class ActionType(str, Enum):
    """Types of actions the system can execute."""
    SUBMIT_PA = "submit_pa"
    CHECK_STATUS = "check_status"
    REQUEST_DOCUMENTS = "request_documents"
    SUBMIT_DOCUMENTS = "submit_documents"
    INITIATE_APPEAL = "initiate_appeal"
    SUBMIT_APPEAL = "submit_appeal"
    PEER_TO_PEER_REQUEST = "peer_to_peer_request"
    NOTIFY_PROVIDER = "notify_provider"
    NOTIFY_PATIENT = "notify_patient"


class CoverageStatus(str, Enum):
    """Coverage assessment status.

    Following Anthropic's conservative decision model:
    - AI should NEVER recommend DENY by default
    - Only APPROVE (criteria met) or PEND (needs documentation)
    - NOT_COVERED and potential denials require explicit human review
    """
    COVERED = "covered"  # All criteria met, proceed with approval
    LIKELY_COVERED = "likely_covered"  # High confidence, may need PA
    REQUIRES_PA = "requires_pa"  # Coverage available with prior auth
    CONDITIONAL = "conditional"  # Coverage with specific conditions
    PEND = "pend"  # Needs additional documentation (not denial)
    NOT_COVERED = "not_covered"  # Policy doesn't cover - REQUIRES HUMAN REVIEW
    REQUIRES_HUMAN_REVIEW = "requires_human_review"  # AI cannot determine - human must decide
    UNKNOWN = "unknown"  # Insufficient information


class StrategyType(str, Enum):
    """Types of access strategies.

    IMPORTANT: PA submissions must ALWAYS follow primary-first order.
    - Never submit to primary and secondary in parallel (COB coordination issues)
    - Never submit to secondary before primary (violates insurance rules)
    - Only sequential primary-first strategies are valid
    """
    SEQUENTIAL_PRIMARY_FIRST = "sequential_primary_first"  # The only valid approach


class EventType(str, Enum):
    """Types of audit events."""
    CASE_CREATED = "case_created"
    STAGE_CHANGED = "stage_changed"
    POLICY_ANALYZED = "policy_analyzed"
    STRATEGY_GENERATED = "strategy_generated"
    STRATEGY_SELECTED = "strategy_selected"
    ACTION_EXECUTED = "action_executed"
    PAYER_RESPONSE = "payer_response"
    RECOVERY_INITIATED = "recovery_initiated"
    CASE_COMPLETED = "case_completed"
    ERROR_OCCURRED = "error_occurred"


class DocumentType(str, Enum):
    """Types of clinical documents."""
    LAB_RESULT = "lab_result"
    IMAGING = "imaging"
    CLINICAL_NOTE = "clinical_note"
    PRESCRIPTION = "prescription"
    PRIOR_AUTH_FORM = "prior_auth_form"
    APPEAL_LETTER = "appeal_letter"
    PEER_TO_PEER_NOTES = "peer_to_peer_notes"
