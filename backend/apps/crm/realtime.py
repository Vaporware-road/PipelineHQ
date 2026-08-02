"""Realtime fan-out helpers (Django Channels). Safe no-ops if Channels is unavailable."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def _channel_layer():
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        if layer is None:
            return None, None
        return layer, async_to_sync
    except Exception:
        return None, None


def user_group(user_id: int) -> str:
    return f"user_{user_id}"


def push_to_user(user_id: int | None, event_type: str, payload: dict):
    if not user_id:
        return
    layer, async_to_sync = _channel_layer()
    if not layer or not async_to_sync:
        return
    try:
        async_to_sync(layer.group_send)(
            user_group(user_id),
            {"type": "realtime.event", "event": event_type, "payload": payload},
        )
    except Exception:
        logger.exception("Failed to push realtime event %s to user %s", event_type, user_id)


def push_notification(notification) -> None:
    from .serializers import NotificationSerializer

    data = NotificationSerializer(notification).data
    payload = dict(data)
    push_to_user(notification.user_id, "notification", payload)


def push_job(job) -> None:
    """Notify the requester and every active Sales Manager (Jobs page is manager-heavy)."""
    from apps.accounts.models import User

    from .serializers import JobRunSerializer

    data = dict(JobRunSerializer(job).data)
    recipients: set[int] = set()
    if job.requested_by_id:
        recipients.add(job.requested_by_id)
    for mid in User.objects.filter(role=User.Role.MANAGER, is_active=True).values_list("id", flat=True):
        recipients.add(mid)
    for user_id in recipients:
        push_to_user(user_id, "job_update", data)
