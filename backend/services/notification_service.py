"""Notification service for alerts and communications."""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from enum import Enum

from backend.models.enums import TaskCategory
from backend.reasoning.llm_gateway import get_llm_gateway
from backend.config.logging_config import get_logger

logger = get_logger(__name__)


class NotificationType(str, Enum):
    """Types of notifications."""
    PROVIDER_UPDATE = "provider_update"
    PATIENT_UPDATE = "patient_update"
    PAYER_RESPONSE = "payer_response"
    ACTION_REQUIRED = "action_required"
    APPROVAL_NOTICE = "approval_notice"
    DENIAL_NOTICE = "denial_notice"
    DOCUMENT_REQUEST = "document_request"


class NotificationService:
    """
    Service for managing notifications and communications.
    Uses Gemini/Azure for content generation (with fallback).
    """

    def __init__(self):
        """Initialize notification service."""
        self._pending_notifications: List[Dict[str, Any]] = []
        self._sent_notifications: List[Dict[str, Any]] = []
        logger.info("Notification service initialized")

    async def create_notification(
        self,
        notification_type: NotificationType,
        recipient_type: str,
        case_id: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a notification.

        Args:
            notification_type: Type of notification
            recipient_type: Type of recipient (provider, patient, etc.)
            case_id: Related case ID
            context: Context for notification content

        Returns:
            Created notification
        """
        logger.info(
            "Creating notification",
            type=notification_type.value,
            recipient=recipient_type,
            case_id=case_id
        )

        # Generate notification content using LLM
        llm_gateway = get_llm_gateway()
        content = await llm_gateway.generate(
            task_category=TaskCategory.NOTIFICATION,
            prompt=self._build_notification_prompt(notification_type, recipient_type, context),
            temperature=0.3,
            response_format="text"
        )

        notification = {
            "id": f"NOTIF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "type": notification_type.value,
            "recipient_type": recipient_type,
            "case_id": case_id,
            "content": content.get("response", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
            "context": context
        }

        self._pending_notifications.append(notification)
        return notification

    async def send_notification(self, notification_id: str) -> Dict[str, Any]:
        """
        Send a pending notification.

        Args:
            notification_id: Notification ID

        Returns:
            Send result
        """
        # Find notification
        notification = None
        for n in self._pending_notifications:
            if n["id"] == notification_id:
                notification = n
                break

        if not notification:
            return {"error": "Notification not found"}

        # Simulate sending
        notification["status"] = "sent"
        notification["sent_at"] = datetime.now(timezone.utc).isoformat()

        # Move to sent
        self._pending_notifications.remove(notification)
        self._sent_notifications.append(notification)

        logger.info(
            "Notification sent",
            notification_id=notification_id,
            recipient_type=notification["recipient_type"]
        )

        return {"status": "sent", "notification_id": notification_id}

    async def create_provider_update(
        self,
        case_id: str,
        update_type: str,
        details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a provider update notification.

        Args:
            case_id: Case ID
            update_type: Type of update
            details: Update details

        Returns:
            Notification
        """
        context = {
            "update_type": update_type,
            "details": details,
            "case_id": case_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        return await self.create_notification(
            notification_type=NotificationType.PROVIDER_UPDATE,
            recipient_type="provider",
            case_id=case_id,
            context=context
        )

    async def create_approval_notice(
        self,
        case_id: str,
        payer_name: str,
        approval_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create an approval notice.

        Args:
            case_id: Case ID
            payer_name: Name of approving payer
            approval_details: Approval information

        Returns:
            Notification
        """
        context = {
            "payer_name": payer_name,
            "approval_details": approval_details,
            "case_id": case_id
        }

        return await self.create_notification(
            notification_type=NotificationType.APPROVAL_NOTICE,
            recipient_type="provider",
            case_id=case_id,
            context=context
        )

    async def create_denial_notice(
        self,
        case_id: str,
        payer_name: str,
        denial_reason: str,
        appeal_deadline: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a denial notice.

        Args:
            case_id: Case ID
            payer_name: Name of denying payer
            denial_reason: Reason for denial
            appeal_deadline: Deadline for appeal

        Returns:
            Notification
        """
        context = {
            "payer_name": payer_name,
            "denial_reason": denial_reason,
            "appeal_deadline": appeal_deadline,
            "case_id": case_id
        }

        return await self.create_notification(
            notification_type=NotificationType.DENIAL_NOTICE,
            recipient_type="provider",
            case_id=case_id,
            context=context
        )

    async def create_document_request(
        self,
        case_id: str,
        payer_name: str,
        required_documents: List[str]
    ) -> Dict[str, Any]:
        """
        Create a document request notification.

        Args:
            case_id: Case ID
            payer_name: Requesting payer
            required_documents: List of required documents

        Returns:
            Notification
        """
        context = {
            "payer_name": payer_name,
            "required_documents": required_documents,
            "case_id": case_id
        }

        return await self.create_notification(
            notification_type=NotificationType.DOCUMENT_REQUEST,
            recipient_type="provider",
            case_id=case_id,
            context=context
        )

    def get_pending_notifications(self, case_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get pending notifications, optionally filtered by case."""
        if case_id:
            return [n for n in self._pending_notifications if n["case_id"] == case_id]
        return self._pending_notifications.copy()

    def get_sent_notifications(self, case_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get sent notifications, optionally filtered by case."""
        if case_id:
            return [n for n in self._sent_notifications if n["case_id"] == case_id]
        return self._sent_notifications.copy()

    def _build_notification_prompt(
        self,
        notification_type: NotificationType,
        recipient_type: str,
        context: Dict[str, Any]
    ) -> str:
        """Build prompt for notification content generation."""
        templates = {
            NotificationType.PROVIDER_UPDATE: """
Draft a professional update notification for a healthcare provider.
Update Type: {update_type}
Details: {details}

Requirements:
- Clear and concise
- Include relevant action items
- Professional medical terminology
- HIPAA compliant
""",
            NotificationType.APPROVAL_NOTICE: """
Draft an approval notification for a prior authorization case.
Payer: {payer_name}
Approval Details: {approval_details}

Requirements:
- Congratulatory but professional
- Include key approval information (dates, quantities)
- Next steps for prescription fulfillment
""",
            NotificationType.DENIAL_NOTICE: """
Draft a denial notification with appeal information.
Payer: {payer_name}
Denial Reason: {denial_reason}
Appeal Deadline: {appeal_deadline}

Requirements:
- Clear explanation of denial
- Appeal options and deadline
- Supportive tone
- Action items for appeal
""",
            NotificationType.DOCUMENT_REQUEST: """
Draft a document request notification.
Payer: {payer_name}
Required Documents: {required_documents}

Requirements:
- Clear list of needed documents
- Urgency level if applicable
- Submission instructions
"""
        }

        template = templates.get(notification_type, "Draft a professional notification about: {details}")
        return template.format(**context)


# Global instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get or create the global notification service."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
