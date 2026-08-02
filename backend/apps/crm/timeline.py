"""Unified CRM timeline: query-union of live rows + persisted TimelineEvent."""

from __future__ import annotations

from typing import Any

from django.db.models import Q

from apps.accounts.serializers import UserSerializer

from .models import (
    Activity,
    Contact,
    DealComment,
    EmailMessage,
    Lead,
    Meeting,
    Opportunity,
    SequenceEnrollment,
    Task,
    TimelineEvent,
)


def _actor_payload(user) -> dict | None:
    if user is None:
        return None
    return UserSerializer(user).data


def _event(
    *,
    source: str,
    event_type: str,
    title: str,
    body: str = "",
    occurred_at,
    actor=None,
    href: str = "",
    meta: dict | None = None,
    related: dict | None = None,
) -> dict[str, Any]:
    return {
        "id": f"{source}:{meta.get('id') if meta else ''}",
        "source": source,
        "event_type": event_type,
        "title": title,
        "body": body or "",
        "occurred_at": occurred_at.isoformat() if hasattr(occurred_at, "isoformat") else occurred_at,
        "actor": _actor_payload(actor),
        "href": href,
        "meta": meta or {},
        "related": related or {},
    }


def _opp_ids_for_account(account_id: int) -> list[int]:
    return list(Opportunity.objects.filter(account_id=account_id).values_list("id", flat=True))


def _opp_ids_for_contact(contact_id: int) -> list[int]:
    return list(
        Opportunity.objects.filter(
            Q(primary_contact_id=contact_id) | Q(account__contacts__id=contact_id)
        )
        .distinct()
        .values_list("id", flat=True)
    )


def build_timeline(
    *,
    account_id: int | None = None,
    contact_id: int | None = None,
    lead_id: int | None = None,
    opportunity_id: int | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    if not any([account_id, contact_id, lead_id, opportunity_id]):
        return []

    events: list[dict[str, Any]] = []
    opp_ids: list[int] = []
    lead_ids: list[int] = []

    if opportunity_id:
        opp_ids = [opportunity_id]
        lead_ids = list(
            Lead.objects.filter(converted_opportunity_id=opportunity_id).values_list("id", flat=True)
        )
    elif account_id:
        opp_ids = _opp_ids_for_account(account_id)
        lead_ids = list(
            Lead.objects.filter(
                Q(converted_account_id=account_id) | Q(converted_opportunity_id__in=opp_ids)
            ).values_list("id", flat=True)
        )
    elif contact_id:
        opp_ids = _opp_ids_for_contact(contact_id)
        lead_ids = list(
            Lead.objects.filter(
                Q(converted_contact_id=contact_id) | Q(converted_opportunity_id__in=opp_ids)
            ).values_list("id", flat=True)
        )
        contact = Contact.objects.filter(pk=contact_id).select_related("account").first()
        if contact and contact.email:
            # Also surface open leads that share this email (pre-convert history).
            lead_ids = list(
                set(lead_ids)
                | set(
                    Lead.objects.filter(email__iexact=contact.email).values_list("id", flat=True)
                )
            )
    elif lead_id:
        lead_ids = [lead_id]
        lead = Lead.objects.filter(pk=lead_id).first()
        if lead and lead.converted_opportunity_id:
            opp_ids = [lead.converted_opportunity_id]

    # Persisted TimelineEvent rows
    te_q = Q()
    if opportunity_id:
        te_q |= Q(opportunity_id=opportunity_id) | Q(
            entity_type=TimelineEvent.EntityType.OPPORTUNITY, entity_id=opportunity_id
        )
    if account_id:
        te_q |= Q(account_id=account_id) | Q(
            entity_type=TimelineEvent.EntityType.ACCOUNT, entity_id=account_id
        )
    if contact_id:
        te_q |= Q(contact_id=contact_id) | Q(
            entity_type=TimelineEvent.EntityType.CONTACT, entity_id=contact_id
        )
    if lead_id:
        te_q |= Q(lead_id=lead_id) | Q(entity_type=TimelineEvent.EntityType.LEAD, entity_id=lead_id)
    if opp_ids and not opportunity_id:
        te_q |= Q(opportunity_id__in=opp_ids)
    if lead_ids and not lead_id:
        te_q |= Q(lead_id__in=lead_ids)

    if te_q:
        for row in TimelineEvent.objects.filter(te_q).select_related("actor")[:limit]:
            href = ""
            if row.opportunity_id:
                href = f"/opportunities/{row.opportunity_id}"
            elif row.lead_id:
                href = f"/leads/{row.lead_id}"
            elif row.contact_id:
                href = f"/contacts/{row.contact_id}"
            elif row.account_id:
                href = f"/accounts/{row.account_id}"
            events.append(
                _event(
                    source="timeline_event",
                    event_type=row.event_type,
                    title=row.title,
                    body=row.body,
                    occurred_at=row.occurred_at,
                    actor=row.actor,
                    href=href,
                    meta={"id": row.id, **(row.meta or {})},
                )
            )

    # Activities
    if opp_ids:
        for a in (
            Activity.objects.filter(opportunity_id__in=opp_ids)
            .select_related("created_by", "opportunity")
            .order_by("-created_at")[:limit]
        ):
            events.append(
                _event(
                    source="activity",
                    event_type=a.type,
                    title=a.subject,
                    body=a.body,
                    occurred_at=a.created_at,
                    actor=a.created_by,
                    href=f"/opportunities/{a.opportunity_id}",
                    meta={"id": a.id, "completed": a.completed, "opportunity_id": a.opportunity_id},
                    related={"opportunity_id": a.opportunity_id, "opportunity_name": a.opportunity.name},
                )
            )

        for c in (
            DealComment.objects.filter(opportunity_id__in=opp_ids)
            .select_related("author", "opportunity")
            .order_by("-created_at")[:limit]
        ):
            events.append(
                _event(
                    source="comment",
                    event_type="comment",
                    title="Comment",
                    body=c.body,
                    occurred_at=c.created_at,
                    actor=c.author,
                    href=f"/opportunities/{c.opportunity_id}",
                    meta={"id": c.id, "opportunity_id": c.opportunity_id},
                    related={"opportunity_id": c.opportunity_id, "opportunity_name": c.opportunity.name},
                )
            )

    # Tasks (created + completed)
    task_q = Q()
    if opp_ids:
        task_q |= Q(opportunity_id__in=opp_ids)
    if lead_ids:
        task_q |= Q(lead_id__in=lead_ids)
    if task_q:
        for t in Task.objects.filter(task_q).select_related("owner", "lead", "opportunity")[:limit]:
            href = (
                f"/opportunities/{t.opportunity_id}"
                if t.opportunity_id
                else (f"/leads/{t.lead_id}" if t.lead_id else "/tasks")
            )
            events.append(
                _event(
                    source="task",
                    event_type="task_created",
                    title=f"Task: {t.title}",
                    body=t.description,
                    occurred_at=t.created_at,
                    actor=t.owner,
                    href=href,
                    meta={"id": t.id, "completed": t.completed},
                )
            )
            if t.completed and t.completed_at:
                events.append(
                    _event(
                        source="task",
                        event_type="task_completed",
                        title=f"Completed: {t.title}",
                        body="",
                        occurred_at=t.completed_at,
                        actor=t.owner,
                        href=href,
                        meta={"id": t.id, "completed": True},
                    )
                )

    # Sequence enrollments
    if lead_ids:
        for en in (
            SequenceEnrollment.objects.filter(lead_id__in=lead_ids)
            .select_related("sequence", "enrolled_by", "lead")
            .order_by("-created_at")[:limit]
        ):
            events.append(
                _event(
                    source="sequence",
                    event_type="sequence_enrolled",
                    title=f"Enrolled in {en.sequence.name}",
                    body=en.last_message or f"Status: {en.status}",
                    occurred_at=en.created_at,
                    actor=en.enrolled_by,
                    href=f"/leads/{en.lead_id}",
                    meta={"id": en.id, "status": en.status, "sequence_id": en.sequence_id},
                )
            )

    # Email messages (live union — also recorded as TimelineEvent on send/open/click)
    email_q = Q()
    if opportunity_id:
        email_q |= Q(opportunity_id=opportunity_id)
    if lead_id:
        email_q |= Q(lead_id=lead_id)
    if contact_id:
        email_q |= Q(contact_id=contact_id)
    if opp_ids and not opportunity_id:
        email_q |= Q(opportunity_id__in=opp_ids)
    if lead_ids and not lead_id:
        email_q |= Q(lead_id__in=lead_ids)
    if email_q:
        for em in (
            EmailMessage.objects.filter(email_q)
            .select_related("sent_by")
            .order_by("-created_at")[:limit]
        ):
            href = f"/opportunities/{em.opportunity_id}" if em.opportunity_id else (
                f"/leads/{em.lead_id}" if em.lead_id else ""
            )
            events.append(
                _event(
                    source="email",
                    event_type="email_sent" if em.status == EmailMessage.Status.SENT else em.status,
                    title=em.subject,
                    body=f"To {em.to_email} · opens {em.open_count} · clicks {em.click_count}",
                    occurred_at=em.sent_at or em.created_at,
                    actor=em.sent_by,
                    href=href,
                    meta={
                        "id": em.id,
                        "status": em.status,
                        "open_count": em.open_count,
                        "click_count": em.click_count,
                    },
                )
            )

    # Meetings
    meeting_q = Q()
    if opportunity_id:
        meeting_q |= Q(opportunity_id=opportunity_id)
    if lead_id:
        meeting_q |= Q(lead_id=lead_id)
    if contact_id:
        meeting_q |= Q(contact_id=contact_id)
    if opp_ids and not opportunity_id:
        meeting_q |= Q(opportunity_id__in=opp_ids)
    if lead_ids and not lead_id:
        meeting_q |= Q(lead_id__in=lead_ids)
    if meeting_q:
        for m in (
            Meeting.objects.filter(meeting_q)
            .select_related("host")
            .order_by("-starts_at")[:limit]
        ):
            href = f"/opportunities/{m.opportunity_id}" if m.opportunity_id else "/calendar"
            events.append(
                _event(
                    source="meeting",
                    event_type="meeting",
                    title=m.title,
                    body=f"{m.invitee_name} <{m.invitee_email}> · {m.status}",
                    occurred_at=m.starts_at,
                    actor=m.host,
                    href=href,
                    meta={"id": m.id, "status": m.status},
                )
            )

    # Deduplicate by (source, id, event_type) and sort
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for ev in events:
        key = f"{ev['source']}:{ev['meta'].get('id')}:{ev['event_type']}:{ev['occurred_at']}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(ev)

    unique.sort(key=lambda e: e["occurred_at"] or "", reverse=True)
    return unique[:limit]


def record_timeline_event(
    *,
    entity_type: str,
    entity_id: int,
    event_type: str,
    title: str,
    body: str = "",
    actor=None,
    meta: dict | None = None,
    account=None,
    contact=None,
    lead=None,
    opportunity=None,
    account_id: int | None = None,
    contact_id: int | None = None,
    lead_id: int | None = None,
    opportunity_id: int | None = None,
    occurred_at=None,
) -> TimelineEvent:
    kwargs = {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "event_type": event_type,
        "title": title,
        "body": body,
        "actor": actor,
        "meta": meta or {},
    }
    if account is not None:
        kwargs["account"] = account
    elif account_id is not None:
        kwargs["account_id"] = account_id
    if contact is not None:
        kwargs["contact"] = contact
    elif contact_id is not None:
        kwargs["contact_id"] = contact_id
    if lead is not None:
        kwargs["lead"] = lead
    elif lead_id is not None:
        kwargs["lead_id"] = lead_id
    if opportunity is not None:
        kwargs["opportunity"] = opportunity
    elif opportunity_id is not None:
        kwargs["opportunity_id"] = opportunity_id
    if occurred_at is not None:
        kwargs["occurred_at"] = occurred_at
    return TimelineEvent.objects.create(**kwargs)
