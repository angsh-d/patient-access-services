"""Immutable audit logger for decision tracking."""
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.storage.models import DecisionEventModel
from backend.models.audit import DecisionEvent, AuditTrail
from backend.models.enums import EventType
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class AuditLogger:
    """
    Immutable audit logger for tracking all decisions.
    Creates cryptographically chained events for integrity verification.
    """

    def __init__(self, session: AsyncSession):
        """
        Initialize the audit logger.

        Args:
            session: SQLAlchemy async session
        """
        self.session = session

    async def log_event(
        self,
        case_id: str,
        event_type: EventType,
        decision_made: str,
        reasoning: str,
        stage: str,
        input_data: Any,
        alternatives: Optional[List[Dict[str, Any]]] = None,
        actor: str = "system"
    ) -> DecisionEvent:
        """
        Log a decision event with chain integrity.

        Args:
            case_id: Case this event belongs to
            event_type: Type of event
            decision_made: Description of the decision
            reasoning: Reasoning behind the decision
            stage: Current case stage
            input_data: Input data (will be hashed)
            alternatives: Alternative options considered
            actor: Who/what made the decision

        Returns:
            Created decision event
        """
        # Get the last event for this case to maintain chain
        last_event = await self._get_last_event(case_id)
        previous_event_id = last_event.id if last_event else None
        previous_signature = last_event.signature if last_event else None

        # Create the event
        event = DecisionEvent(
            event_id=str(uuid4()),
            case_id=case_id,
            event_type=event_type,
            timestamp=datetime.now(timezone.utc),
            decision_made=decision_made,
            reasoning=reasoning,
            stage=stage,
            actor=actor,
            input_data_hash=DecisionEvent.hash_input_data(input_data),
            input_data_summary=self._create_summary(input_data),
            alternatives=alternatives or [],
            previous_event_id=previous_event_id
        )

        # Compute signature (includes previous signature for chaining)
        event.signature = event.compute_signature(previous_signature)

        # Store in database
        db_event = DecisionEventModel(
            id=event.event_id,
            case_id=event.case_id,
            event_type=event.event_type.value,
            timestamp=event.timestamp,
            decision_made=event.decision_made,
            reasoning=event.reasoning,
            stage=event.stage,
            actor=event.actor,
            input_data_hash=event.input_data_hash,
            input_data_summary=event.input_data_summary,
            alternatives=event.alternatives,
            signature=event.signature,
            previous_event_id=event.previous_event_id
        )

        self.session.add(db_event)
        await self.session.flush()

        logger.info(
            "Audit event logged",
            event_id=event.event_id,
            case_id=case_id,
            event_type=event_type.value
        )

        return event

    async def log_case_created(
        self,
        case_id: str,
        patient_id: str,
        medication_name: str
    ) -> DecisionEvent:
        """Log case creation event."""
        return await self.log_event(
            case_id=case_id,
            event_type=EventType.CASE_CREATED,
            decision_made=f"Created case for patient {patient_id}",
            reasoning=f"Prior authorization case initiated for {medication_name}",
            stage="intake",
            input_data={"patient_id": patient_id, "medication": medication_name}
        )

    async def log_stage_change(
        self,
        case_id: str,
        from_stage: str,
        to_stage: str,
        reason: str
    ) -> DecisionEvent:
        """Log stage transition event."""
        return await self.log_event(
            case_id=case_id,
            event_type=EventType.STAGE_CHANGED,
            decision_made=f"Transitioned from {from_stage} to {to_stage}",
            reasoning=reason,
            stage=to_stage,
            input_data={"from_stage": from_stage, "to_stage": to_stage}
        )

    async def log_strategy_selected(
        self,
        case_id: str,
        selected_strategy: Dict[str, Any],
        all_scores: List[Dict[str, Any]],
        reasoning: str
    ) -> DecisionEvent:
        """Log strategy selection event."""
        alternatives = [
            {
                "strategy_id": s.get("strategy_id"),
                "name": s.get("strategy_name", "Unknown"),
                "score": s.get("total_score"),
                "rank": s.get("rank")
            }
            for s in all_scores
            if s.get("strategy_id") != selected_strategy.get("strategy_id")
        ]

        return await self.log_event(
            case_id=case_id,
            event_type=EventType.STRATEGY_SELECTED,
            decision_made=f"Selected strategy: {selected_strategy.get('name', 'Unknown')}",
            reasoning=reasoning,
            stage="strategy_selection",
            input_data={"selected": selected_strategy, "scores": all_scores},
            alternatives=alternatives
        )

    async def log_action_executed(
        self,
        case_id: str,
        action_type: str,
        target: Optional[str],
        result: Dict[str, Any],
        stage: str
    ) -> DecisionEvent:
        """Log action execution event."""
        success = result.get("success", False)
        return await self.log_event(
            case_id=case_id,
            event_type=EventType.ACTION_EXECUTED,
            decision_made=f"Executed {action_type}" + (f" for {target}" if target else ""),
            reasoning=f"Action {'succeeded' if success else 'failed'}: {result.get('message', '')}",
            stage=stage,
            input_data={"action_type": action_type, "target": target, "result": result}
        )

    async def log_payer_response(
        self,
        case_id: str,
        payer_name: str,
        response_type: str,
        details: Dict[str, Any],
        stage: str
    ) -> DecisionEvent:
        """Log payer response event."""
        return await self.log_event(
            case_id=case_id,
            event_type=EventType.PAYER_RESPONSE,
            decision_made=f"{payer_name} response: {response_type}",
            reasoning=details.get("reason", "Payer determination received"),
            stage=stage,
            input_data={"payer": payer_name, "response_type": response_type, "details": details}
        )

    async def get_audit_trail(self, case_id: str) -> AuditTrail:
        """
        Get the complete audit trail for a case.

        Args:
            case_id: Case ID

        Returns:
            AuditTrail with all events
        """
        result = await self.session.execute(
            select(DecisionEventModel)
            .where(DecisionEventModel.case_id == case_id)
            .order_by(DecisionEventModel.timestamp.asc())
        )
        db_events = result.scalars().all()

        events = []
        for db_event in db_events:
            events.append(DecisionEvent(
                event_id=db_event.id,
                case_id=db_event.case_id,
                event_type=EventType(db_event.event_type),
                timestamp=db_event.timestamp,
                decision_made=db_event.decision_made,
                reasoning=db_event.reasoning,
                stage=db_event.stage,
                actor=db_event.actor,
                input_data_hash=db_event.input_data_hash,
                input_data_summary=db_event.input_data_summary or {},
                alternatives=db_event.alternatives or [],
                signature=db_event.signature,
                previous_event_id=db_event.previous_event_id
            ))

        trail = AuditTrail(case_id=case_id, events=events)
        if events:
            trail.last_signature = events[-1].signature

        return trail

    async def verify_chain_integrity(self, case_id: str) -> Dict[str, Any]:
        """
        Verify the integrity of the audit chain for a case.

        Args:
            case_id: Case ID

        Returns:
            Verification result with details
        """
        trail = await self.get_audit_trail(case_id)
        is_valid = trail.verify_chain()

        return {
            "case_id": case_id,
            "chain_valid": is_valid,
            "event_count": len(trail.events),
            "first_event": trail.events[0].timestamp.isoformat() if trail.events else None,
            "last_event": trail.events[-1].timestamp.isoformat() if trail.events else None,
        }

    async def _get_last_event(self, case_id: str) -> Optional[DecisionEventModel]:
        """Get the last event for a case."""
        result = await self.session.execute(
            select(DecisionEventModel)
            .where(DecisionEventModel.case_id == case_id)
            .order_by(DecisionEventModel.timestamp.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _create_summary(data: Any) -> Dict[str, Any]:
        """Create a summary of input data for storage."""
        if isinstance(data, dict):
            return {k: str(v)[:100] for k, v in list(data.items())[:10]}
        return {"data": str(data)[:200]}
