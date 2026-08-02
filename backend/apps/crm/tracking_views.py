"""Public open/click tracking endpoints (AllowAny)."""

from __future__ import annotations

from urllib.parse import unquote

from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from django.views import View

from .automation import create_notification
from .email_tracking import TRACKING_GIF
from .models import EmailMessage, Notification
from .timeline import record_timeline_event


def _related_link(msg: EmailMessage) -> str:
    if msg.opportunity_id:
        return f"/opportunities/{msg.opportunity_id}"
    if msg.lead_id:
        return f"/leads/{msg.lead_id}"
    return "/dashboard"


def _notify_owner(msg: EmailMessage, *, kind: str, title: str, body: str):
    owner = msg.sent_by
    if msg.lead_id and msg.lead.owner_id:
        owner = msg.lead.owner
    elif msg.opportunity_id and msg.opportunity.owner_id:
        owner = msg.opportunity.owner
    if not owner:
        return
    create_notification(user=owner, title=title, body=body, kind=kind, link=_related_link(msg))


def _timeline_for_message(msg: EmailMessage, event_type: str, title: str, body: str = ""):
    meta = {"id": msg.id, "email_id": msg.id, "to": msg.to_email}
    if msg.opportunity_id:
        record_timeline_event(
            entity_type="opportunity",
            entity_id=msg.opportunity_id,
            event_type=event_type,
            title=title,
            body=body,
            opportunity_id=msg.opportunity_id,
            lead_id=msg.lead_id,
            contact_id=msg.contact_id,
            meta=meta,
        )
    if msg.lead_id:
        record_timeline_event(
            entity_type="lead",
            entity_id=msg.lead_id,
            event_type=event_type,
            title=title,
            body=body,
            lead_id=msg.lead_id,
            opportunity_id=msg.opportunity_id,
            meta=meta,
        )
    if msg.contact_id:
        record_timeline_event(
            entity_type="contact",
            entity_id=msg.contact_id,
            event_type=event_type,
            title=title,
            body=body,
            contact_id=msg.contact_id,
            account_id=msg.contact.account_id,
            meta=meta,
        )


class TrackOpenView(View):
    def get(self, request, token: str):
        msg = (
            EmailMessage.objects.select_related("lead", "lead__owner", "opportunity", "opportunity__owner", "contact")
            .filter(tracking_token=token)
            .first()
        )
        if msg:
            first = msg.open_count == 0
            msg.open_count += 1
            if not msg.opened_at:
                msg.opened_at = timezone.now()
            msg.save(update_fields=["open_count", "opened_at", "updated_at"])
            if first:
                _timeline_for_message(msg, "email_open", f"Opened: {msg.subject}", msg.to_email)
                _notify_owner(
                    msg,
                    kind=Notification.Kind.EMAIL_OPEN,
                    title=f"Prospect opened: {msg.subject}",
                    body=f"{msg.to_email} opened your email",
                )
        return HttpResponse(TRACKING_GIF, content_type="image/gif")


class TrackClickView(View):
    def get(self, request, token: str):
        target = unquote(request.GET.get("u") or "/")
        if not target.startswith(("http://", "https://")):
            target = "/"
        msg = (
            EmailMessage.objects.select_related("lead", "lead__owner", "opportunity", "opportunity__owner", "contact")
            .filter(tracking_token=token)
            .first()
        )
        if msg:
            first = msg.click_count == 0
            msg.click_count += 1
            if not msg.clicked_at:
                msg.clicked_at = timezone.now()
            msg.save(update_fields=["click_count", "clicked_at", "updated_at"])
            if first:
                _timeline_for_message(msg, "email_click", f"Clicked: {msg.subject}", target)
                _notify_owner(
                    msg,
                    kind=Notification.Kind.EMAIL_CLICK,
                    title=f"Prospect clicked: {msg.subject}",
                    body=f"{msg.to_email} clicked a link",
                )
        return HttpResponseRedirect(target)
