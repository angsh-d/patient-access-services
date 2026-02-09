"""FastAPI dependencies for dependency injection."""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from backend.storage.database import get_session_factory
from backend.services.case_service import CaseService
from backend.services.strategy_service import StrategyService
from backend.services.notification_service import get_notification_service, NotificationService
from backend.mock_services.scenarios import get_scenario_manager, ScenarioManager


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get database session dependency."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_case_service() -> AsyncGenerator[CaseService, None]:
    """Get case service dependency."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield CaseService(session)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_strategy_service() -> AsyncGenerator[StrategyService, None]:
    """Get strategy service dependency."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield StrategyService(session)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_notification() -> NotificationService:
    """Get notification service dependency."""
    return get_notification_service()


def get_scenarios() -> ScenarioManager:
    """Get scenario manager dependency."""
    return get_scenario_manager()
