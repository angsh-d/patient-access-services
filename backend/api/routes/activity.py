"""AI activity feed API routes."""
from typing import Optional
from fastapi import APIRouter, Depends, Query

from backend.api.responses import AIActivityResponse, AIActivityItem
from backend.api.dependencies import get_case_service
from backend.services.case_service import CaseService
from backend.config.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/activity", tags=["Activity"])


# Map event types to agent types
EVENT_TO_AGENT = {
    "case_created": "intake",
    "stage_changed": "action_coordinator",
    "strategy_selected": "strategy_generator",
    "action_executed": "action_coordinator",
    "payer_response": "action_coordinator",
    "policy_analyzed": "policy_analyzer",
    "recovery_initiated": "recovery",
}

# Map event types to status
EVENT_TO_STATUS = {
    "case_created": "success",
    "stage_changed": "success",
    "strategy_selected": "success",
    "action_executed": "success",
    "payer_response": "success",
    "recovery_initiated": "in_progress",
}


@router.get("/recent", response_model=AIActivityResponse)
async def get_recent_activity(
    limit: int = Query(10, ge=1, le=50, description="Maximum number of activities"),
    case_service: CaseService = Depends(get_case_service)
):
    """
    Get recent AI activity across all cases.

    This endpoint aggregates audit trail events from all cases and transforms
    them into AI activity items for the dashboard display.

    Args:
        limit: Maximum number of activity items to return
        case_service: Injected case service

    Returns:
        List of recent AI activities
    """
    try:
        # Get all cases to aggregate audit trails
        cases = await case_service.list_cases(limit=20)

        activities = []

        for case_data in cases:
            case_id = case_data["case_id"]
            patient = case_data.get("patient", {})
            patient_name = f"{patient.get('first_name', 'Unknown')} {patient.get('last_name', '')}"
            medication = case_data.get("medication", {})
            medication_name = medication.get("medication_name", "Unknown")

            # Get audit trail for this case
            try:
                trail = await case_service.get_audit_trail(case_id)
                events = trail.get("events", [])

                for event in events:
                    event_type = event.get("event_type", "").lower().replace(" ", "_")
                    agent_type = EVENT_TO_AGENT.get(event_type, "action_coordinator")
                    status = EVENT_TO_STATUS.get(event_type, "success")

                    # Extract confidence from reasoning if available
                    confidence = None
                    reasoning = event.get("reasoning", "")
                    if "%" in reasoning:
                        try:
                            # Try to extract percentage from reasoning
                            import re
                            matches = re.findall(r'(\d+(?:\.\d+)?)\s*%', reasoning)
                            if matches:
                                confidence = float(matches[0]) / 100
                        except (ValueError, IndexError):
                            pass

                    activities.append(AIActivityItem(
                        id=event.get("event_id", f"{case_id}-{len(activities)}"),
                        agent_type=agent_type,
                        action=event.get("decision_made", "Unknown action"),
                        detail=medication_name if medication_name != "Unknown" else None,
                        confidence=confidence,
                        timestamp=event.get("timestamp", ""),
                        case_id=case_id,
                        patient_name=patient_name.strip() or None,
                        status=status,
                        reasoning=reasoning if reasoning else None,
                    ))
            except Exception as e:
                logger.warning(f"Could not get audit trail for case {case_id}: {e}")
                continue

        # Sort by timestamp descending and limit
        activities.sort(key=lambda x: x.timestamp, reverse=True)
        limited_activities = activities[:limit]

        return AIActivityResponse(
            activities=limited_activities,
            total=len(activities)
        )

    except Exception as e:
        logger.error("Error getting recent activity", error=str(e))
        return AIActivityResponse(activities=[], total=0)
