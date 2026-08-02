"""Append-only audit log helpers (manager compliance — separate from TimelineEvent)."""

from __future__ import annotations

from django.forms.models import model_to_dict
from django.utils import timezone

from .models import Account, AuditEvent, Contact, Lead, Opportunity

TRACKED_MODELS = {
    Lead: AuditEvent.EntityType.LEAD,
    Account: AuditEvent.EntityType.ACCOUNT,
    Contact: AuditEvent.EntityType.CONTACT,
    Opportunity: AuditEvent.EntityType.OPPORTUNITY,
}

# Fields to compare on update (skip noisy / denormalized).
TRACKED_FIELDS = {
    AuditEvent.EntityType.LEAD: [
        "name",
        "email",
        "company",
        "title",
        "industry",
        "status",
        "source",
        "notes",
        "owner_id",
    ],
    AuditEvent.EntityType.ACCOUNT: [
        "name",
        "domain",
        "industry",
        "owner_id",
        "territory_id",
    ],
    AuditEvent.EntityType.CONTACT: [
        "name",
        "email",
        "title",
        "phone",
        "account_id",
    ],
    AuditEvent.EntityType.OPPORTUNITY: [
        "name",
        "amount",
        "stage",
        "close_date",
        "forecast_category",
        "next_step",
        "owner_id",
        "account_id",
        "primary_contact_id",
        "health",
    ],
}


def _label_for(instance) -> str:
    return str(instance)[:255]


def _serialize(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "__float__") and not isinstance(value, bool):
        try:
            return float(value)
        except (TypeError, ValueError):
            pass
    return value


def record_audit(
    *,
    action: str,
    entity_type: str,
    entity_id: int,
    entity_label: str = "",
    changes: dict | None = None,
    actor=None,
):
    return AuditEvent.objects.create(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=entity_label or "",
        changes=changes or {},
        occurred_at=timezone.now(),
    )


def snapshot_tracked(instance) -> dict:
    entity_type = TRACKED_MODELS.get(type(instance))
    if not entity_type:
        return {}
    fields = TRACKED_FIELDS[entity_type]
    data = model_to_dict(instance, fields=[f.replace("_id", "") if f.endswith("_id") else f for f in fields if not f.endswith("_id")])
    # Prefer explicit *_id for FKs
    out = {}
    for field in fields:
        if field.endswith("_id"):
            out[field] = getattr(instance, field, None)
        else:
            out[field] = _serialize(getattr(instance, field, None))
    # Merge any leftover from model_to_dict for non-fk
    for k, v in data.items():
        key = k if k in out else k
        if key in fields:
            out[key] = _serialize(v)
    return {k: _serialize(v) for k, v in out.items()}


def diff_snapshots(before: dict, after: dict) -> dict:
    changes = {}
    keys = set(before) | set(after)
    for key in keys:
        old = before.get(key)
        new = after.get(key)
        if old != new:
            changes[key] = {"from": old, "to": new}
    return changes


def audit_action_for_changes(changes: dict) -> str:
    if "stage" in changes:
        return AuditEvent.Action.STAGE
    if "status" in changes:
        return AuditEvent.Action.STATUS
    if "owner_id" in changes:
        return AuditEvent.Action.OWNER
    return AuditEvent.Action.UPDATE
