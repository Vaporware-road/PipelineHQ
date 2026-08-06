"""Send Telegram Bot API messages (used by Celery worker)."""

from __future__ import annotations

import asyncio
import logging

from celery import shared_task
from django.conf import settings

from .alerts import (
    format_lead_status_alert,
    format_meeting_status_alert,
    format_opportunity_stage_alert,
)

logger = logging.getLogger(__name__)


async def _send_message(chat_id: int, text: str) -> bool:
    token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
    if not token:
        logger.warning("telegram notify skipped: TELEGRAM_BOT_TOKEN missing")
        return False
    from telegram import Bot

    async with Bot(token) as bot:
        await bot.send_message(chat_id=chat_id, text=text, disable_web_page_preview=False)
    return True


def send_telegram_message(chat_id: int, text: str) -> bool:
    """Sync wrapper for Celery / management commands."""
    try:
        return asyncio.run(_send_message(chat_id, text))
    except Exception:
        logger.exception("telegram send_message failed chat_id=%s", chat_id)
        return False


def _owner_telegram_id(user) -> int | None:
    if user is None:
        return None
    tid = getattr(user, "telegram_id", None)
    return int(tid) if tid is not None else None


@shared_task(bind=True, name="telegram.notify_lead_status_change")
def notify_lead_status_change(self, lead_id: int, old_status: str, new_status: str):
    from apps.crm.models import Lead

    try:
        lead = Lead.objects.select_related("owner").get(pk=lead_id)
    except Lead.DoesNotExist:
        logger.info("telegram notify: lead %s missing", lead_id)
        return {"ok": False, "reason": "missing"}

    chat_id = _owner_telegram_id(lead.owner)
    if chat_id is None:
        return {"ok": False, "reason": "unlinked"}

    text, start = format_lead_status_alert(
        lead_id=lead.id,
        name=lead.name,
        old_status=old_status,
        new_status=new_status,
    )
    sent = send_telegram_message(chat_id, text)
    return {"ok": sent, "chat_id": chat_id, "start_param": start}


@shared_task(bind=True, name="telegram.notify_opportunity_stage_change")
def notify_opportunity_stage_change(self, opportunity_id: int, old_stage: str, new_stage: str):
    from apps.crm.models import Opportunity

    try:
        opp = Opportunity.objects.select_related("owner").get(pk=opportunity_id)
    except Opportunity.DoesNotExist:
        logger.info("telegram notify: opportunity %s missing", opportunity_id)
        return {"ok": False, "reason": "missing"}

    chat_id = _owner_telegram_id(opp.owner)
    if chat_id is None:
        return {"ok": False, "reason": "unlinked"}

    text, start = format_opportunity_stage_alert(
        opportunity_id=opp.id,
        name=opp.name,
        old_stage=old_stage,
        new_stage=new_stage,
    )
    sent = send_telegram_message(chat_id, text)
    return {"ok": sent, "chat_id": chat_id, "start_param": start}


@shared_task(bind=True, name="telegram.notify_meeting_status_change")
def notify_meeting_status_change(self, meeting_id: int, old_status: str, new_status: str):
    from apps.crm.models import Meeting

    try:
        meeting = Meeting.objects.select_related("host").get(pk=meeting_id)
    except Meeting.DoesNotExist:
        logger.info("telegram notify: meeting %s missing", meeting_id)
        return {"ok": False, "reason": "missing"}

    chat_id = _owner_telegram_id(meeting.host)
    if chat_id is None:
        return {"ok": False, "reason": "unlinked"}

    text, start = format_meeting_status_alert(
        meeting_id=meeting.id,
        title=meeting.title,
        old_status=old_status,
        new_status=new_status,
    )
    sent = send_telegram_message(chat_id, text)
    return {"ok": sent, "chat_id": chat_id, "start_param": start}
