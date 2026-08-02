"""Phase 2 automation helpers: MEDDIC gates, lead routing, in-app notifications."""

from __future__ import annotations

import re

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User

from .models import Comment, Lead, LeadRoutingRule, Notification, Opportunity

USER_MENTION_RE = re.compile(r"@@([a-zA-Z0-9_]+)")
ROLE_MENTION_RE = re.compile(r"(?<!@)@([A-Za-z]+)")
ROLE_ALIASES = {
    "sdr": User.Role.SDR,
    "ae": User.Role.AE,
    "manager": User.Role.MANAGER,
}

# Fields required to *enter* (or be at) a given stage.
MEDDIC_REQUIRED_FOR_STAGE: dict[str, list[str]] = {
    Opportunity.Stage.PROPOSAL: ["champion", "identify_pain"],
    Opportunity.Stage.NEGOTIATION: ["champion", "identify_pain", "economic_buyer"],
    Opportunity.Stage.CLOSED_WON: ["champion", "identify_pain", "economic_buyer"],
}

FIELD_LABELS = {
    "metrics": "Metrics",
    "economic_buyer": "Economic buyer",
    "decision_criteria": "Decision criteria",
    "decision_process": "Decision process",
    "identify_pain": "Identify pain",
    "champion": "Champion",
    "win_reason": "Win reason",
    "loss_reason": "Loss reason",
}


def create_notification(
    *,
    user: User,
    title: str,
    body: str = "",
    kind: str = Notification.Kind.OTHER,
    link: str = "",
) -> Notification:
    note = Notification.objects.create(
        user=user,
        title=title,
        body=body,
        kind=kind,
        link=link,
    )
    try:
        from .realtime import push_notification

        push_notification(note)
    except Exception:
        pass
    return note


def notify_mentions_in_body(
    *,
    body: str,
    actor: User,
    link: str,
    entity_label: str = "a comment",
) -> list[Notification]:
    """
    Fan-out notifications for mention tokens:
    - @@username → that user
    - @ROLE (SDR|AE|MANAGER) → all active users with that role
    """
    text = body or ""
    recipient_ids: set[int] = set()

    usernames = {m.group(1) for m in USER_MENTION_RE.finditer(text)}
    if usernames:
        q = Q()
        for name in usernames:
            q |= Q(username__iexact=name)
        for user in User.objects.filter(q, is_active=True).exclude(pk=actor.pk):
            recipient_ids.add(user.pk)

    for m in ROLE_MENTION_RE.finditer(text):
        role = ROLE_ALIASES.get(m.group(1).lower())
        if not role:
            continue
        for user in User.objects.filter(role=role, is_active=True).exclude(pk=actor.pk):
            recipient_ids.add(user.pk)

    created: list[Notification] = []
    for user in User.objects.filter(pk__in=recipient_ids):
        created.append(
            create_notification(
                user=user,
                title=f"{actor.username} mentioned you on {entity_label}",
                body=text[:280],
                kind=Notification.Kind.MENTION,
                link=link,
            )
        )
    return created


def notify_comment_mentions(comment: Comment) -> list[Notification]:
    label = "a comment"
    if comment.opportunity_id:
        label = "a deal"
    elif comment.lead_id:
        label = "a lead"
    elif comment.task_id:
        label = "a task"
    elif comment.meeting_id:
        label = "a meeting"
    return notify_mentions_in_body(
        body=comment.body,
        actor=comment.author,
        link=comment.mention_link(),
        entity_label=label,
    )


def missing_meddic_fields(opportunity: Opportunity, stage: str) -> list[str]:
    required = MEDDIC_REQUIRED_FOR_STAGE.get(stage, [])
    checklist = opportunity.meddic_checklist()
    return [field for field in required if not checklist.get(field)]


def validate_stage_transition(opportunity: Opportunity, new_stage: str, attrs: dict | None = None):
    """
    Raise ValidationError with field-level errors when stage advance is blocked.
    `attrs` may contain pending MEDDIC / win-loss values from the same PATCH.
    """
    attrs = attrs or {}
    if new_stage == opportunity.stage:
        return

    for field in (
        "metrics",
        "economic_buyer",
        "decision_criteria",
        "decision_process",
        "identify_pain",
        "champion",
        "win_reason",
        "loss_reason",
    ):
        if field in attrs:
            setattr(opportunity, field, attrs[field] or "")

    errors: dict[str, list[str]] = {}

    missing = missing_meddic_fields(opportunity, new_stage)
    for field in missing:
        errors[field] = [f"Required for {new_stage.replace('_', ' ')} stage (MEDDIC)."]

    if new_stage == Opportunity.Stage.CLOSED_WON:
        win = (attrs.get("win_reason") if "win_reason" in attrs else opportunity.win_reason) or ""
        if not str(win).strip():
            errors["win_reason"] = ["Required when closing as won."]
    if new_stage == Opportunity.Stage.CLOSED_LOST:
        loss = (attrs.get("loss_reason") if "loss_reason" in attrs else opportunity.loss_reason) or ""
        if not str(loss).strip():
            errors["loss_reason"] = ["Required when closing as lost."]

    if errors:
        raise serializers.ValidationError(errors)


def apply_closed_timestamp(opportunity: Opportunity, new_stage: str):
    closed = {Opportunity.Stage.CLOSED_WON, Opportunity.Stage.CLOSED_LOST}
    if new_stage in closed and not opportunity.closed_at:
        opportunity.closed_at = timezone.now()
    elif new_stage not in closed:
        opportunity.closed_at = None


@transaction.atomic
def assign_lead_via_routing(lead: Lead, *, explicit_owner: bool) -> Lead:
    """
    If routing is enabled and owner was not explicitly chosen, round-robin SDRs.
    Creates an in-app notification for the assignee.
    """
    if explicit_owner:
        return lead

    rule = (
        LeadRoutingRule.objects.select_for_update()
        .filter(enabled=True, source=lead.source)
        .order_by("id")
        .first()
    )
    if rule is None:
        rule = (
            LeadRoutingRule.objects.select_for_update()
            .filter(enabled=True, source="")
            .order_by("id")
            .first()
        )
    if rule is None or rule.strategy != LeadRoutingRule.Strategy.ROUND_ROBIN:
        return lead

    sdrs_qs = User.objects.filter(role=User.Role.SDR, is_active=True)
    if rule.territory_id:
        territory_sdrs = sdrs_qs.filter(territories=rule.territory_id).order_by("id")
        sdrs = list(territory_sdrs) or list(sdrs_qs.order_by("id"))
    else:
        sdrs = list(sdrs_qs.order_by("id"))
    if not sdrs:
        return lead

    next_owner = sdrs[0]
    if rule.last_assignee_id:
        ids = [u.id for u in sdrs]
        try:
            idx = ids.index(rule.last_assignee_id)
            next_owner = sdrs[(idx + 1) % len(sdrs)]
        except ValueError:
            next_owner = sdrs[0]

    lead.owner = next_owner
    lead.save(update_fields=["owner", "updated_at"])
    rule.last_assignee = next_owner
    rule.save(update_fields=["last_assignee", "updated_at"])

    create_notification(
        user=next_owner,
        title="New lead assigned",
        body=f"{lead.name} @ {lead.company} was routed to you ({lead.source}).",
        kind=Notification.Kind.ASSIGNMENT,
        link=f"/leads/{lead.id}",
    )
    return lead


def ensure_default_routing_rule() -> LeadRoutingRule:
    rule, _ = LeadRoutingRule.objects.get_or_create(
        name="Default routing",
        defaults={"enabled": True, "source": "", "strategy": LeadRoutingRule.Strategy.ROUND_ROBIN},
    )
    return rule
