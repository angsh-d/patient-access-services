"""Policy routes — serves digitized policy data from NeonDB."""
from fastapi import APIRouter, HTTPException

from backend.policy_digitalization.policy_repository import get_policy_repository
from backend.config.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("/{payer}/{medication}/digitized")
async def get_digitized_policy(payer: str, medication: str):
    """Return the digitized policy for a payer/medication from the DB cache."""
    repo = get_policy_repository()
    policy = await repo.load(payer, medication)
    if policy is None:
        raise HTTPException(status_code=404, detail=f"No digitized policy for {payer}/{medication}")
    return policy.model_dump(mode="json")
