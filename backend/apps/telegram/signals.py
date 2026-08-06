"""Enqueue Telegram alerts when CRM status/stage fields change."""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.crm.models import Lead, Meeting, Opportunity

from .tasks import (
    notify_lead_status_change,
    notify_meeting_status_change,
    notify_opportunity_stage_change,
)


@receiver(pre_save, sender=Lead)
def lead_status_change_mark(sender, instance: Lead, **kwargs):
    instance._telegram_status_change = None
    if not instance.pk:
        return
    try:
        previous = Lead.objects.only("status").get(pk=instance.pk)
    except Lead.DoesNotExist:
        return
    if previous.status != instance.status:
        instance._telegram_status_change = (previous.status, instance.status)


@receiver(post_save, sender=Lead)
def lead_status_change_notify(sender, instance: Lead, **kwargs):
    change = getattr(instance, "_telegram_status_change", None)
    if not change:
        return
    notify_lead_status_change.delay(instance.pk, change[0], change[1])


@receiver(pre_save, sender=Opportunity)
def opportunity_stage_change_mark(sender, instance: Opportunity, **kwargs):
    instance._telegram_stage_change = None
    if not instance.pk:
        return
    try:
        previous = Opportunity.objects.only("stage").get(pk=instance.pk)
    except Opportunity.DoesNotExist:
        return
    if previous.stage != instance.stage:
        instance._telegram_stage_change = (previous.stage, instance.stage)


@receiver(post_save, sender=Opportunity)
def opportunity_stage_change_notify(sender, instance: Opportunity, **kwargs):
    change = getattr(instance, "_telegram_stage_change", None)
    if not change:
        return
    notify_opportunity_stage_change.delay(instance.pk, change[0], change[1])


@receiver(pre_save, sender=Meeting)
def meeting_status_change_mark(sender, instance: Meeting, **kwargs):
    instance._telegram_status_change = None
    if not instance.pk:
        return
    try:
        previous = Meeting.objects.only("status").get(pk=instance.pk)
    except Meeting.DoesNotExist:
        return
    if previous.status != instance.status:
        instance._telegram_status_change = (previous.status, instance.status)


@receiver(post_save, sender=Meeting)
def meeting_status_change_notify(sender, instance: Meeting, **kwargs):
    change = getattr(instance, "_telegram_status_change", None)
    if not change:
        return
    notify_meeting_status_change.delay(instance.pk, change[0], change[1])
