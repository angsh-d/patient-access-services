"""Repository for case CRUD operations."""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import uuid4

from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.storage.models import CaseModel, CaseStateSnapshotModel
from backend.models.case_state import CaseState, PatientInfo, MedicationRequest, PayerState
from backend.models.enums import CaseStage
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class CaseRepository:
    """Repository for case database operations with versioning."""

    def __init__(self, session: AsyncSession):
        """
        Initialize the repository with a database session.

        Args:
            session: SQLAlchemy async session
        """
        self.session = session

    async def create(self, case_state: CaseState) -> CaseModel:
        """
        Create a new case in the database.

        Args:
            case_state: Initial case state

        Returns:
            Created case model
        """
        case = CaseModel(
            id=case_state.case_id,
            version=case_state.version,
            created_at=case_state.created_at,
            updated_at=case_state.updated_at,
            stage=case_state.stage.value,
            patient_data=self._patient_to_dict(case_state.patient) if case_state.patient else None,
            medication_data=self._medication_to_dict(case_state.medication) if case_state.medication else None,
            payer_states={k: self._payer_state_to_dict(v) for k, v in case_state.payer_states.items()},
            coverage_assessments=case_state.coverage_assessments,
            documentation_gaps=case_state.documentation_gaps,
            available_strategies=case_state.available_strategies,
            selected_strategy_id=case_state.selected_strategy_id,
            strategy_rationale=case_state.strategy_rationale,
            pending_actions=case_state.pending_actions,
            completed_actions=case_state.completed_actions,
            error_message=case_state.error_message,
            metadata_json=case_state.metadata
        )

        self.session.add(case)
        await self.session.flush()

        # Create initial snapshot
        await self._create_snapshot(case, "Case created")

        logger.info("Case created", case_id=case.id)
        return case

    async def get_by_id(self, case_id: str) -> Optional[CaseModel]:
        """
        Get a case by ID.

        Args:
            case_id: Case ID

        Returns:
            Case model or None
        """
        result = await self.session.execute(
            select(CaseModel).where(CaseModel.id == case_id)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        stage: Optional[CaseStage] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[CaseModel]:
        """
        Get all cases with optional filtering.

        Args:
            stage: Filter by stage
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of case models
        """
        query = select(CaseModel)

        if stage:
            query = query.where(CaseModel.stage == stage.value)

        query = query.order_by(CaseModel.updated_at.desc())
        query = query.limit(limit).offset(offset)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count(self, stage: Optional[CaseStage] = None) -> int:
        """
        Count total cases with optional stage filter.

        Args:
            stage: Optional stage filter

        Returns:
            Total number of matching cases
        """
        query = select(func.count(CaseModel.id))
        if stage:
            query = query.where(CaseModel.stage == stage.value)
        result = await self.session.execute(query)
        return result.scalar_one()

    async def update(
        self,
        case_id: str,
        updates: Dict[str, Any],
        change_description: Optional[str] = None,
        expected_version: Optional[int] = None
    ) -> Optional[CaseModel]:
        """
        Update a case with versioning and optimistic locking.

        Args:
            case_id: Case ID
            updates: Dictionary of fields to update
            change_description: Description of the change
            expected_version: If provided, enforces optimistic locking.
                              Update fails if current version != expected_version.

        Returns:
            Updated case model

        Raises:
            ValueError: If optimistic lock fails (version mismatch)
        """
        case = await self.get_by_id(case_id)
        if not case:
            return None

        # Optimistic locking check
        if expected_version is not None and case.version != expected_version:
            raise ValueError(
                f"Optimistic lock failed for case {case_id}: "
                f"expected version {expected_version}, found {case.version}. "
                f"Another operation may have modified this case concurrently."
            )

        # Increment version
        new_version = case.version + 1
        updates["version"] = new_version
        updates["updated_at"] = datetime.now(timezone.utc)

        # Apply updates
        for key, value in updates.items():
            if hasattr(case, key):
                setattr(case, key, value)

        # Create snapshot and flush together for atomicity
        snapshot = CaseStateSnapshotModel(
            id=str(uuid4()),
            case_id=case.id,
            version=case.version,
            created_at=datetime.now(timezone.utc),
            state_data=case.to_dict(),
            change_description=change_description or "Case updated",
            changed_by="system"
        )
        self.session.add(snapshot)
        await self.session.flush()

        logger.info("Case updated", case_id=case_id, version=new_version)
        return case

    async def update_stage(
        self,
        case_id: str,
        new_stage: CaseStage
    ) -> Optional[CaseModel]:
        """
        Update case stage with versioning.

        Args:
            case_id: Case ID
            new_stage: New stage

        Returns:
            Updated case model
        """
        return await self.update(
            case_id=case_id,
            updates={"stage": new_stage.value},
            change_description=f"Stage changed to {new_stage.value}"
        )

    async def delete(self, case_id: str) -> bool:
        """
        Delete a case.

        Args:
            case_id: Case ID

        Returns:
            True if deleted, False if not found
        """
        result = await self.session.execute(
            delete(CaseModel).where(CaseModel.id == case_id)
        )
        deleted = result.rowcount > 0
        if deleted:
            logger.info("Case deleted", case_id=case_id)
        return deleted

    async def get_snapshots(self, case_id: str) -> List[CaseStateSnapshotModel]:
        """
        Get all state snapshots for a case.

        Args:
            case_id: Case ID

        Returns:
            List of state snapshots
        """
        result = await self.session.execute(
            select(CaseStateSnapshotModel)
            .where(CaseStateSnapshotModel.case_id == case_id)
            .order_by(CaseStateSnapshotModel.version.desc())
        )
        return list(result.scalars().all())

    async def get_snapshot_at_version(
        self,
        case_id: str,
        version: int
    ) -> Optional[CaseStateSnapshotModel]:
        """
        Get a specific version snapshot.

        Args:
            case_id: Case ID
            version: Version number

        Returns:
            State snapshot or None
        """
        result = await self.session.execute(
            select(CaseStateSnapshotModel)
            .where(CaseStateSnapshotModel.case_id == case_id)
            .where(CaseStateSnapshotModel.version == version)
        )
        return result.scalar_one_or_none()

    async def _create_snapshot(
        self,
        case: CaseModel,
        change_description: str
    ) -> CaseStateSnapshotModel:
        """Create a state snapshot for versioning."""
        snapshot = CaseStateSnapshotModel(
            id=str(uuid4()),
            case_id=case.id,
            version=case.version,
            created_at=datetime.now(timezone.utc),
            state_data=case.to_dict(),
            change_description=change_description,
            changed_by="system"
        )
        self.session.add(snapshot)
        await self.session.flush()
        return snapshot

    def to_case_state(self, case: CaseModel) -> CaseState:
        """
        Convert database model to domain CaseState.

        Args:
            case: Database case model

        Returns:
            Domain CaseState object
        """
        patient = None
        if case.patient_data:
            patient = PatientInfo(**case.patient_data)

        medication = None
        if case.medication_data:
            medication = MedicationRequest(**case.medication_data)

        payer_states = {}
        if case.payer_states:
            for name, data in case.payer_states.items():
                payer_states[name] = PayerState(**data)

        return CaseState(
            case_id=case.id,
            version=case.version,
            created_at=case.created_at,
            updated_at=case.updated_at,
            stage=CaseStage(case.stage),
            patient=patient,
            medication=medication,
            payer_states=payer_states,
            coverage_assessments=case.coverage_assessments or {},
            documentation_gaps=case.documentation_gaps or [],
            available_strategies=case.available_strategies or [],
            selected_strategy_id=case.selected_strategy_id,
            strategy_rationale=case.strategy_rationale,
            pending_actions=case.pending_actions or [],
            completed_actions=case.completed_actions or [],
            error_message=case.error_message,
            metadata=case.metadata_json or {}
        )

    @staticmethod
    def _patient_to_dict(patient: PatientInfo) -> dict:
        """Convert PatientInfo to dict."""
        return {
            "patient_id": patient.patient_id,
            "first_name": patient.first_name,
            "last_name": patient.last_name,
            "date_of_birth": patient.date_of_birth,
            "primary_payer": patient.primary_payer,
            "primary_member_id": patient.primary_member_id,
            "secondary_payer": patient.secondary_payer,
            "secondary_member_id": patient.secondary_member_id,
            "diagnosis_codes": patient.diagnosis_codes,
            "allergies": patient.allergies,
            "contraindications": patient.contraindications,
        }

    @staticmethod
    def _medication_to_dict(medication: MedicationRequest) -> dict:
        """Convert MedicationRequest to dict."""
        return {
            "medication_name": medication.medication_name,
            "generic_name": medication.generic_name,
            "ndc_code": medication.ndc_code,
            "dose": medication.dose,
            "frequency": medication.frequency,
            "route": medication.route,
            "duration": medication.duration,
            "diagnosis": medication.diagnosis,
            "icd10_code": medication.icd10_code,
            "prescriber_npi": medication.prescriber_npi,
            "prescriber_name": medication.prescriber_name,
            "clinical_rationale": medication.clinical_rationale,
            "prior_treatments": medication.prior_treatments,
            "supporting_labs": medication.supporting_labs,
        }

    @staticmethod
    def _payer_state_to_dict(payer_state: PayerState) -> dict:
        """Convert PayerState to dict."""
        return {
            "payer_name": payer_state.payer_name,
            "status": payer_state.status.value if hasattr(payer_state.status, 'value') else payer_state.status,
            "reference_number": payer_state.reference_number,
            "submitted_at": payer_state.submitted_at.isoformat() if payer_state.submitted_at else None,
            "last_updated": payer_state.last_updated.isoformat() if payer_state.last_updated else None,
            "response_details": payer_state.response_details,
            "required_documents": payer_state.required_documents,
            "denial_reason": payer_state.denial_reason,
            "appeal_deadline": payer_state.appeal_deadline.isoformat() if payer_state.appeal_deadline else None,
        }
