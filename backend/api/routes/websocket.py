"""WebSocket routes for real-time updates."""
import asyncio
import json
from collections import deque
from datetime import datetime, timezone
from typing import Dict, List, Set, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from backend.orchestrator.case_orchestrator import get_case_orchestrator
from backend.agents.intake_agent import get_intake_agent
from backend.config.settings import get_settings
from backend.config.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """Manages WebSocket connections."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, case_id: str):
        """Accept and track a new connection."""
        await websocket.accept()
        if case_id not in self.active_connections:
            self.active_connections[case_id] = set()
        self.active_connections[case_id].add(websocket)
        logger.info("WebSocket connected", case_id=case_id)

    def disconnect(self, websocket: WebSocket, case_id: str):
        """Remove a disconnected connection."""
        if case_id in self.active_connections:
            self.active_connections[case_id].discard(websocket)
            if not self.active_connections[case_id]:
                del self.active_connections[case_id]
        logger.info("WebSocket disconnected", case_id=case_id)

    async def broadcast_to_case(self, case_id: str, message: dict):
        """Broadcast a message to all connections for a case."""
        if case_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[case_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.add(connection)

            # Clean up disconnected
            for conn in disconnected:
                self.active_connections[case_id].discard(conn)


manager = ConnectionManager()


class NotificationManager:
    """Manages system-wide notification WebSocket connections."""

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._recent: deque = deque(maxlen=10)

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self._connections.add(websocket)
        logger.info("Notification client connected", total=len(self._connections))

    def disconnect(self, websocket: WebSocket):
        self._connections.discard(websocket)
        logger.info("Notification client disconnected", total=len(self._connections))

    async def broadcast_notification(self, notification: dict):
        """Broadcast a notification to all connected clients."""
        message = {
            **notification,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._recent.append(message)

        disconnected: Set[WebSocket] = set()
        for ws in self._connections:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.add(ws)

        for ws in disconnected:
            self._connections.discard(ws)

    @property
    def recent_notifications(self) -> List[dict]:
        return list(self._recent)


_notification_manager: Optional[NotificationManager] = None


def get_notification_manager() -> NotificationManager:
    """Get or create the global NotificationManager."""
    global _notification_manager
    if _notification_manager is None:
        _notification_manager = NotificationManager()
    return _notification_manager


async def _validate_ws_token(websocket: WebSocket, token: Optional[str]) -> bool:
    """
    Validate WebSocket connection token.

    In development mode, accepts any connection for ease of testing.
    In production, requires a valid token query parameter.

    Args:
        websocket: The WebSocket connection
        token: Token from query parameter

    Returns:
        True if valid, False if rejected
    """
    settings = get_settings()

    # In development mode, allow unauthenticated connections
    if settings.app_env == "development":
        return True

    if not token:
        await websocket.close(code=4001, reason="Authentication required: provide ?token= query parameter")
        logger.warning("WebSocket rejected: no token provided")
        return False

    # Validate token against configured WebSocket secret
    ws_secret = getattr(settings, "websocket_auth_token", None)
    if ws_secret and token != ws_secret:
        await websocket.close(code=4003, reason="Invalid authentication token")
        logger.warning("WebSocket rejected: invalid token")
        return False

    return True


@router.websocket("/ws/cases/{case_id}")
async def websocket_case_updates(
    websocket: WebSocket,
    case_id: str,
    token: Optional[str] = Query(default=None),
):
    """
    WebSocket endpoint for real-time case updates.

    Streams processing events as a case moves through the workflow.

    Args:
        websocket: WebSocket connection
        case_id: Case ID to subscribe to
        token: Optional authentication token
    """
    if not await _validate_ws_token(websocket, token):
        return

    await manager.connect(websocket, case_id)

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "event": "connected",
            "case_id": case_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": f"Connected to case {case_id} updates"
        })

        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for messages from client (like process commands)
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0  # Heartbeat interval
                )

                message = json.loads(data)
                await handle_websocket_message(websocket, case_id, message)

            except asyncio.TimeoutError:
                # Send heartbeat
                await websocket.send_json({
                    "event": "heartbeat",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket, case_id)
    except Exception as e:
        logger.error("WebSocket error", case_id=case_id, error=str(e))
        manager.disconnect(websocket, case_id)


async def handle_websocket_message(websocket: WebSocket, case_id: str, message: dict):
    """Handle incoming WebSocket messages."""
    action = message.get("action")

    if action == "process":
        # Start case processing with streaming updates
        await stream_case_processing(websocket, case_id, message.get("options", {}))

    elif action == "status":
        # Return current status
        await websocket.send_json({
            "event": "status",
            "case_id": case_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

    else:
        await websocket.send_json({
            "event": "error",
            "message": f"Unknown action: {action}"
        })


async def stream_case_processing(websocket: WebSocket, case_id: str, options: dict):
    """Stream case processing updates."""
    logger.info("Starting streamed processing", case_id=case_id)

    await websocket.send_json({
        "event": "processing_started",
        "case_id": case_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    try:
        # Get patient data through service layer
        from backend.api.dependencies import get_case_service

        case_state = None
        async for case_service in get_case_service():
            case_state_obj = await case_service.get_case_state(case_id)
            if not case_state_obj:
                await websocket.send_json({
                    "event": "error",
                    "message": f"Case not found: {case_id}"
                })
                return
            case_state = case_state_obj

        # Load patient data
        intake_agent = get_intake_agent()
        patient_data = await intake_agent.load_patient_data(case_state.patient.patient_id)

        medication_data = {
            "medication_request": {
                "medication_name": case_state.medication.medication_name,
                "generic_name": case_state.medication.generic_name,
                "ndc_code": case_state.medication.ndc_code,
                "dose": case_state.medication.dose,
                "frequency": case_state.medication.frequency,
                "route": case_state.medication.route,
                "duration": case_state.medication.duration,
                "diagnosis": case_state.medication.diagnosis,
                "icd10_code": case_state.medication.icd10_code,
                "clinical_rationale": case_state.medication.clinical_rationale,
            }
        }

        # Stream processing
        orchestrator = get_case_orchestrator()

        async for event in orchestrator.stream_case_processing(
            case_id=case_id,
            patient_id=case_state.patient.patient_id,
            patient_data=patient_data,
            medication_data=medication_data,
            payers=list(case_state.payer_states.keys())
        ):
            # Send each state update
            stage = event.get("stage")
            if hasattr(stage, "value"):
                stage = stage.value

            await websocket.send_json({
                "event": "stage_update",
                "case_id": case_id,
                "stage": stage,
                "previous_stage": event.get("previous_stage", {}).value if hasattr(event.get("previous_stage"), "value") else event.get("previous_stage"),
                "messages": event.get("messages", []),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

            # Also broadcast to other connections
            await manager.broadcast_to_case(case_id, {
                "event": "stage_update",
                "case_id": case_id,
                "stage": stage,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

        await websocket.send_json({
            "event": "processing_completed",
            "case_id": case_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

    except Exception as e:
        logger.error("Error in streamed processing", case_id=case_id, error=str(e))
        await websocket.send_json({
            "event": "processing_error",
            "case_id": case_id,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        })


@router.websocket("/ws/notifications")
async def websocket_notifications(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
):
    """
    WebSocket endpoint for system-wide notifications.

    Streams policy update notifications and other system events.

    Args:
        websocket: WebSocket connection
        token: Optional authentication token
    """
    if not await _validate_ws_token(websocket, token):
        return

    notif_mgr = get_notification_manager()
    await notif_mgr.connect(websocket)

    try:
        # Send connection confirmation + any missed notifications
        await websocket.send_json({
            "event": "connected",
            "scope": "notifications",
            "recent": notif_mgr.recent_notifications,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        while True:
            try:
                await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0,
                )
            except asyncio.TimeoutError:
                await websocket.send_json({
                    "event": "heartbeat",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    except WebSocketDisconnect:
        notif_mgr.disconnect(websocket)
    except Exception as e:
        logger.error("Notifications WebSocket error", error=str(e))
        notif_mgr.disconnect(websocket)
