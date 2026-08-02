from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .audit import (
    TRACKED_MODELS,
    audit_action_for_changes,
    diff_snapshots,
    record_audit,
    snapshot_tracked,
)
from .models import Account, Contact, Lead, Opportunity, TimelineEvent
from .timeline import record_timeline_event

_AUDIT_CACHE: dict[tuple[type, int], dict] = {}


def _actor_from(instance):
    return getattr(instance, "_audit_actor", None) or getattr(instance, "_timeline_actor", None)


@receiver(pre_save, sender=Opportunity)
def opportunity_stage_timeline(sender, instance: Opportunity, **kwargs):
    if not instance.pk:
        return
    try:
        previous = Opportunity.objects.only("stage").get(pk=instance.pk)
    except Opportunity.DoesNotExist:
        return
    if previous.stage == instance.stage:
        return
    actor = getattr(instance, "_timeline_actor", None)
    record_timeline_event(
        entity_type=TimelineEvent.EntityType.OPPORTUNITY,
        entity_id=instance.pk,
        event_type=TimelineEvent.EventType.STAGE_CHANGE,
        title=f"Stage: {previous.stage} → {instance.stage}",
        body="",
        actor=actor,
        account_id=instance.account_id,
        contact_id=instance.primary_contact_id,
        opportunity_id=instance.pk,
        meta={"from": previous.stage, "to": instance.stage},
    )


@receiver(pre_save, sender=Lead)
def lead_status_timeline(sender, instance: Lead, **kwargs):
    if not instance.pk:
        return
    try:
        previous = Lead.objects.only("status").get(pk=instance.pk)
    except Lead.DoesNotExist:
        return
    if previous.status == instance.status:
        return
    actor = getattr(instance, "_timeline_actor", None)
    record_timeline_event(
        entity_type=TimelineEvent.EntityType.LEAD,
        entity_id=instance.pk,
        event_type=TimelineEvent.EventType.STATUS_CHANGE,
        title=f"Status: {previous.status} → {instance.status}",
        body="",
        actor=actor,
        lead_id=instance.pk,
        account_id=instance.converted_account_id,
        contact_id=instance.converted_contact_id,
        opportunity_id=instance.converted_opportunity_id,
        meta={"from": previous.status, "to": instance.status},
    )


def _cache_pre_save(sender, instance, **kwargs):
    if sender not in TRACKED_MODELS or not instance.pk:
        return
    try:
        previous = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return
    _AUDIT_CACHE[(sender, instance.pk)] = snapshot_tracked(previous)


def _audit_post_save(sender, instance, created, **kwargs):
    entity_type = TRACKED_MODELS.get(sender)
    if not entity_type:
        return
    actor = _actor_from(instance)
    if created:
        record_audit(
            action="create",
            entity_type=entity_type,
            entity_id=instance.pk,
            entity_label=_label_safe(instance),
            changes=snapshot_tracked(instance),
            actor=actor,
        )
        return

    before = _AUDIT_CACHE.pop((sender, instance.pk), None)
    if before is None:
        return
    after = snapshot_tracked(instance)
    changes = diff_snapshots(before, after)
    if not changes:
        return
    record_audit(
        action=audit_action_for_changes(changes),
        entity_type=entity_type,
        entity_id=instance.pk,
        entity_label=_label_safe(instance),
        changes=changes,
        actor=actor,
    )


def _audit_post_delete(sender, instance, **kwargs):
    entity_type = TRACKED_MODELS.get(sender)
    if not entity_type:
        return
    record_audit(
        action="delete",
        entity_type=entity_type,
        entity_id=instance.pk,
        entity_label=_label_safe(instance),
        changes=snapshot_tracked(instance),
        actor=_actor_from(instance),
    )


def _label_safe(instance) -> str:
    try:
        return str(instance)[:255]
    except Exception:
        return ""


for _model in (Lead, Account, Contact, Opportunity):
    pre_save.connect(_cache_pre_save, sender=_model, dispatch_uid=f"audit_pre_{_model.__name__}")
    post_save.connect(_audit_post_save, sender=_model, dispatch_uid=f"audit_post_{_model.__name__}")
    post_delete.connect(_audit_post_delete, sender=_model, dispatch_uid=f"audit_del_{_model.__name__}")
