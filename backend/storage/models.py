"""SQLAlchemy ORM models for database tables."""
from datetime import datetime, timezone
from typing import Optional
import json


def _utcnow():
    """Return current UTC time (timezone-aware)."""
    return datetime.now(timezone.utc)

from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, JSON, Index, UniqueConstraint
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class CaseModel(Base):
    """Database model for cases."""
    __tablename__ = "cases"

    id = Column(String(36), primary_key=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)

    # Stage
    stage = Column(String(50), nullable=False, default="intake")

    # Patient info (JSON)
    patient_data = Column(JSON, nullable=True)

    # Medication info (JSON)
    medication_data = Column(JSON, nullable=True)

    # Payer states (JSON)
    payer_states = Column(JSON, nullable=True, default=dict)

    # Analysis results (JSON)
    coverage_assessments = Column(JSON, nullable=True, default=dict)
    documentation_gaps = Column(JSON, nullable=True, default=list)

    # Strategy
    available_strategies = Column(JSON, nullable=True, default=list)
    selected_strategy_id = Column(String(36), nullable=True)
    strategy_rationale = Column(Text, nullable=True)

    # Execution
    pending_actions = Column(JSON, nullable=True, default=list)
    completed_actions = Column(JSON, nullable=True, default=list)

    # Human decision gate
    human_decisions = Column(JSON, nullable=True, default=list)
    requires_human_decision = Column(Boolean, nullable=False, default=False)
    human_decision_reason = Column(Text, nullable=True)

    # Error handling
    error_message = Column(Text, nullable=True)

    # Metadata
    metadata_json = Column(JSON, nullable=True, default=dict)

    # Indexes for common queries
    __table_args__ = (
        Index('ix_cases_stage', 'stage'),
        Index('ix_cases_updated_at', 'updated_at'),
    )

    # Relationships
    events = relationship("DecisionEventModel", back_populates="case", cascade="all, delete-orphan")
    state_snapshots = relationship("CaseStateSnapshotModel", back_populates="case", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "case_id": self.id,
            "version": self.version,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "stage": self.stage,
            "patient": self.patient_data,
            "medication": self.medication_data,
            "payer_states": self.payer_states or {},
            "coverage_assessments": self.coverage_assessments or {},
            "documentation_gaps": self.documentation_gaps or [],
            "available_strategies": self.available_strategies or [],
            "selected_strategy_id": self.selected_strategy_id,
            "strategy_rationale": self.strategy_rationale,
            "pending_actions": self.pending_actions or [],
            "completed_actions": self.completed_actions or [],
            "human_decisions": self.human_decisions or [],
            "requires_human_decision": self.requires_human_decision,
            "human_decision_reason": self.human_decision_reason,
            "error_message": self.error_message,
            "metadata": self.metadata_json or {},
        }


class DecisionEventModel(Base):
    """Database model for audit events."""
    __tablename__ = "decision_events"

    id = Column(String(36), primary_key=True)
    case_id = Column(String(36), ForeignKey("cases.id"), nullable=False)
    event_type = Column(String(50), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    # Decision details
    decision_made = Column(Text, nullable=False)
    reasoning = Column(Text, nullable=False)
    stage = Column(String(50), nullable=False)
    actor = Column(String(100), nullable=False, default="system")

    # Data hashes
    input_data_hash = Column(String(64), nullable=False)
    input_data_summary = Column(JSON, nullable=True, default=dict)

    # Alternatives
    alternatives = Column(JSON, nullable=True, default=list)

    # Outcome
    outcome = Column(Text, nullable=True)

    # Chain integrity
    signature = Column(String(64), nullable=True)
    previous_event_id = Column(String(36), nullable=True)

    # Indexes
    __table_args__ = (
        Index('ix_decision_events_case_id', 'case_id'),
    )

    # Relationship
    case = relationship("CaseModel", back_populates="events")

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "event_id": self.id,
            "case_id": self.case_id,
            "event_type": self.event_type,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "decision_made": self.decision_made,
            "reasoning": self.reasoning,
            "stage": self.stage,
            "actor": self.actor,
            "input_data_hash": self.input_data_hash,
            "input_data_summary": self.input_data_summary,
            "alternatives": self.alternatives,
            "outcome": self.outcome,
            "signature": self.signature,
            "previous_event_id": self.previous_event_id,
        }


class CaseStateSnapshotModel(Base):
    """Database model for case state snapshots (versioning)."""
    __tablename__ = "case_state_snapshots"

    id = Column(String(36), primary_key=True)
    case_id = Column(String(36), ForeignKey("cases.id"), nullable=False)
    version = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    # Full state snapshot (JSON)
    state_data = Column(JSON, nullable=False)

    # Change description
    change_description = Column(Text, nullable=True)
    changed_by = Column(String(100), nullable=True, default="system")

    # Indexes
    __table_args__ = (
        Index('ix_case_snapshots_case_id', 'case_id'),
    )

    # Relationship
    case = relationship("CaseModel", back_populates="state_snapshots")

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "snapshot_id": self.id,
            "case_id": self.case_id,
            "version": self.version,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "state_data": self.state_data,
            "change_description": self.change_description,
            "changed_by": self.changed_by,
        }


class PolicyCacheModel(Base):
    """Database model for cached policy documents."""
    __tablename__ = "policy_cache"

    id = Column(String(36), primary_key=True)
    payer_name = Column(String(100), nullable=False)
    medication_name = Column(String(200), nullable=False)
    policy_version = Column(String(50), nullable=True)  # "v1", "2024-Q3", "latest"

    # Cache metadata
    cached_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    content_hash = Column(String(64), nullable=False)

    # Amendment metadata
    source_filename = Column(String(500), nullable=True)
    upload_notes = Column(Text, nullable=True)
    amendment_date = Column(DateTime(timezone=True), nullable=True)
    parent_version_id = Column(String(36), nullable=True)

    # Policy content
    policy_text = Column(Text, nullable=False)
    parsed_criteria = Column(JSON, nullable=True)

    # Indexes
    __table_args__ = (
        Index('ix_policy_cache_payer_med', 'payer_name', 'medication_name'),
        Index('ix_policy_cache_payer_med_version', 'payer_name', 'medication_name', 'policy_version'),
    )

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "payer_name": self.payer_name,
            "medication_name": self.medication_name,
            "policy_version": self.policy_version,
            "cached_at": self.cached_at.isoformat() if self.cached_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "content_hash": self.content_hash,
        }


class StrategicIntelligenceCacheModel(Base):
    """Database model for cached strategic intelligence results."""
    __tablename__ = "strategic_intelligence_cache"

    id = Column(String(36), primary_key=True)

    # Cache key components
    case_id = Column(String(36), nullable=False, index=True)
    cache_key_hash = Column(String(64), nullable=False, unique=True, index=True)

    # Key parameters used to generate cache (for debugging/transparency)
    medication_name = Column(String(200), nullable=False)
    icd10_code = Column(String(20), nullable=True)
    payer_name = Column(String(100), nullable=False)

    # Cache metadata
    cached_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    # Cached intelligence data (JSON blob of StrategicInsights.to_dict())
    intelligence_data = Column(JSON, nullable=False)

    # Statistics for monitoring
    similar_cases_count = Column(Integer, nullable=False)
    confidence_score = Column(Float, nullable=False)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "case_id": self.case_id,
            "cache_key_hash": self.cache_key_hash,
            "medication_name": self.medication_name,
            "icd10_code": self.icd10_code,
            "payer_name": self.payer_name,
            "cached_at": self.cached_at.isoformat() if self.cached_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "similar_cases_count": self.similar_cases_count,
            "confidence_score": self.confidence_score,
        }

    def is_expired(self) -> bool:
        """Check if cache entry has expired."""
        return datetime.now(timezone.utc) > self.expires_at


class PolicyDiffCacheModel(Base):
    """Persistent cache for policy diff results + LLM summaries."""
    __tablename__ = "policy_diff_cache"

    id = Column(String(36), primary_key=True)
    payer_name = Column(String(100), nullable=False)
    medication_name = Column(String(200), nullable=False)
    old_version = Column(String(50), nullable=False)
    new_version = Column(String(50), nullable=False)
    old_content_hash = Column(String(64), nullable=False)
    new_content_hash = Column(String(64), nullable=False)
    diff_data = Column(JSON, nullable=False)
    summary_data = Column(JSON, nullable=False)
    cached_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)

    __table_args__ = (
        UniqueConstraint('payer_name', 'medication_name', 'old_version', 'new_version',
                         name='uq_diff_cache_versions'),
        Index('ix_diff_cache_payer_med', 'payer_name', 'medication_name'),
    )


class PolicyQACacheModel(Base):
    """Semantic cache for Policy Assistant Q&A pairs with embeddings."""
    __tablename__ = "policy_qa_cache"

    id = Column(String(36), primary_key=True)
    question_text = Column(Text, nullable=False)
    question_embedding = Column(JSON, nullable=False)  # List of 768 floats
    payer_filter = Column(String(100), nullable=True)
    medication_filter = Column(String(200), nullable=True)
    policy_content_hash = Column(String(64), nullable=False)
    response_data = Column(JSON, nullable=False)  # answer, citations, policies_consulted, confidence
    cached_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    hit_count = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index('ix_qa_cache_filters', 'payer_filter', 'medication_filter'),
        Index('ix_qa_cache_policy_hash', 'policy_content_hash'),
    )
