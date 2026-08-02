"""
Celery tasks — these run in a separate worker process so HTTP requests stay fast.

Learning notes:
- @shared_task lets any Django app register tasks without importing the Celery app.
- Beat schedules periodic tasks (stale scan, cache warm) via django-celery-beat.
- JobRun rows let the UI poll async job status.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta
from decimal import Decimal

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.mail import send_mail
from django.db.models import Count, Q, Sum
from django.utils import timezone


def _set_job(job_id: int | None, **fields):
    if not job_id:
        return
    from .models import JobRun
    from .realtime import push_job

    JobRun.objects.filter(pk=job_id).update(**fields, updated_at=timezone.now())
    job = JobRun.objects.filter(pk=job_id).select_related("requested_by").first()
    if job:
        try:
            push_job(job)
        except Exception:
            pass


@shared_task(bind=True, name="crm.send_notification_email")
def send_notification_email(self, subject: str, message: str, recipient_list: list[str]):
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=recipient_list,
        fail_silently=False,
    )
    return {"sent_to": recipient_list, "subject": subject}


@shared_task(bind=True, name="crm.flag_stale_deals")
def flag_stale_deals(self, job_id: int | None = None):
    from .models import JobRun, Opportunity

    _set_job(job_id, status=JobRun.Status.RUNNING, celery_task_id=self.request.id)
    cutoff = timezone.now() - timedelta(days=settings.STALE_DEAL_DAYS)
    open_stages = [
        Opportunity.Stage.DISCOVERY,
        Opportunity.Stage.DEMO,
        Opportunity.Stage.PROPOSAL,
        Opportunity.Stage.NEGOTIATION,
    ]
    qs = Opportunity.objects.filter(stage__in=open_stages)
    # Stale if no activities after cutoff, or never had activities and updated_at old
    stale_ids = list(
        qs.annotate(last_activity=Count("activities", filter=Q(activities__created_at__gte=cutoff)))
        .filter(Q(last_activity=0), updated_at__lt=cutoff)
        .values_list("id", flat=True)
    )
    updated = qs.filter(id__in=stale_ids).update(is_stale=True)
    # Clear stale flag for deals that became active again
    cleared = qs.exclude(id__in=stale_ids).filter(is_stale=True).update(is_stale=False)
    from .deal_health import refresh_open_deal_health

    health_refreshed = refresh_open_deal_health()
    result = {
        "flagged": updated,
        "cleared": cleared,
        "health_refreshed": health_refreshed,
        "cutoff": cutoff.isoformat(),
    }
    _set_job(
        job_id,
        status=JobRun.Status.SUCCESS,
        message=f"Flagged {updated} stale deals; cleared {cleared}; refreshed health on {health_refreshed}.",
        result_meta=result,
    )
    cache.delete_many(["dashboard:SDR", "dashboard:AE", "dashboard:MANAGER"])
    return result


@shared_task(bind=True, name="crm.warm_dashboard_cache")
def warm_dashboard_cache(self, job_id: int | None = None):
    from apps.accounts.models import User

    from .models import JobRun
    from .services import build_dashboard_payload

    _set_job(job_id, status=JobRun.Status.RUNNING, celery_task_id=self.request.id)
    warmed = []
    for role in User.Role.values:
        # Warm a generic role cache; per-user cache is filled on request.
        payload = build_dashboard_payload(user=None, role=role)
        cache.set(f"dashboard:role:{role}", payload, settings.DASHBOARD_CACHE_TTL)
        warmed.append(role)
    _set_job(
        job_id,
        status=JobRun.Status.SUCCESS,
        message=f"Warmed caches for {', '.join(warmed)}",
        result_meta={"roles": warmed},
    )
    return {"roles": warmed}


@shared_task(bind=True, name="crm.import_leads_csv")
def import_leads_csv(self, job_id: int, owner_id: int, csv_text: str):
    from apps.accounts.models import User

    from .models import JobRun, Lead

    _set_job(job_id, status=JobRun.Status.RUNNING, celery_task_id=self.request.id)
    owner = User.objects.get(pk=owner_id)
    reader = csv.DictReader(io.StringIO(csv_text))
    created = 0
    errors: list[str] = []
    for i, row in enumerate(reader, start=2):
        try:
            Lead.objects.create(
                name=row["name"].strip(),
                email=row["email"].strip(),
                company=row["company"].strip(),
                title=(row.get("title") or "").strip(),
                source=(row.get("source") or Lead.Source.OTHER).strip() or Lead.Source.OTHER,
                owner=owner,
            )
            created += 1
        except Exception as exc:  # noqa: BLE001 - collect row errors for UI
            errors.append(f"row {i}: {exc}")
    status = JobRun.Status.SUCCESS if not errors else JobRun.Status.SUCCESS
    _set_job(
        job_id,
        status=status,
        message=f"Imported {created} leads" + (f" with {len(errors)} row errors" if errors else ""),
        result_meta={"created": created, "errors": errors[:50]},
    )
    return {"created": created, "errors": errors}


@shared_task(bind=True, name="crm.export_forecast_csv")
def export_forecast_csv(self, job_id: int):
    from .models import JobRun, Opportunity

    _set_job(job_id, status=JobRun.Status.RUNNING, celery_task_id=self.request.id)
    qs = (
        Opportunity.objects.filter(
            stage__in=[
                Opportunity.Stage.DISCOVERY,
                Opportunity.Stage.DEMO,
                Opportunity.Stage.PROPOSAL,
                Opportunity.Stage.NEGOTIATION,
                Opportunity.Stage.CLOSED_WON,
            ]
        )
        .select_related("owner", "account")
        .order_by("owner__username", "forecast_category")
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["owner", "account", "opportunity", "amount", "stage", "forecast_category", "close_date", "is_stale"]
    )
    for opp in qs:
        writer.writerow(
            [
                opp.owner.username,
                opp.account.name,
                opp.name,
                str(opp.amount),
                opp.stage,
                opp.forecast_category,
                opp.close_date.isoformat(),
                opp.is_stale,
            ]
        )
    content = ContentFile(buffer.getvalue().encode("utf-8"))
    job = JobRun.objects.get(pk=job_id)
    filename = f"forecast_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
    job.result_file.save(filename, content, save=False)
    job.status = JobRun.Status.SUCCESS
    job.message = f"Export ready ({qs.count()} rows)"
    job.result_meta = {"rows": qs.count(), "filename": filename}
    job.celery_task_id = self.request.id or ""
    job.save()
    return {"rows": qs.count(), "filename": filename}


@shared_task(bind=True, name="crm.export_analytics_csv")
def export_analytics_csv(self, job_id: int, user_id: int, start_iso: str, end_iso: str):
    """Export funnel + activity summary CSV for the requested date range."""
    from apps.accounts.models import User

    from .analytics import build_activity_report, build_funnel, build_overview
    from .models import JobRun

    _set_job(job_id, status=JobRun.Status.RUNNING, celery_task_id=self.request.id)
    user = User.objects.get(pk=user_id)
    start = datetime.fromisoformat(start_iso)
    end = datetime.fromisoformat(end_iso)
    if timezone.is_naive(start):
        start = timezone.make_aware(start, timezone.get_current_timezone())
    if timezone.is_naive(end):
        end = timezone.make_aware(end, timezone.get_current_timezone())

    overview = build_overview(user=user, start=start, end=end)
    funnel = build_funnel(user=user, start=start, end=end)
    activity = build_activity_report(user=user, start=start, end=end)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["section", "metric", "value"])
    for key in (
        "leads_created",
        "leads_converted",
        "conversion_rate",
        "won_amount",
        "won_count",
        "lost_amount",
        "lost_count",
        "avg_cycle_days",
        "open_pipeline_amount",
        "open_deals",
    ):
        writer.writerow(["overview", key, overview[key]])
    writer.writerow(["funnel", "leads_created", funnel["leads_created"]])
    writer.writerow(["funnel", "leads_converted", funnel["leads_converted"]])
    writer.writerow(["funnel", "lead_to_opp_rate", funnel["lead_to_opp_rate"]])
    for row in funnel["stages"]:
        writer.writerow(["funnel_stage", row["stage"], row["count"]])
    for row in activity["by_type"]:
        writer.writerow(["activity_type", row["type"], row["count"]])
    for row in activity["by_user"]:
        writer.writerow(["activity_user", row["username"], row["count"]])

    content = ContentFile(buffer.getvalue().encode("utf-8"))
    job = JobRun.objects.get(pk=job_id)
    filename = f"analytics_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
    job.result_file.save(filename, content, save=False)
    job.status = JobRun.Status.SUCCESS
    job.message = f"Analytics export ready ({overview['from']} → {overview['to']})"
    job.result_meta = {
        "filename": filename,
        "from": overview["from"],
        "to": overview["to"],
        "activity_total": activity["total"],
    }
    job.celery_task_id = self.request.id or ""
    job.save()
    return job.result_meta


@shared_task(bind=True, name="crm.reset_demo_data")
def reset_demo_data(self, job_id: int | None = None):
    from django.core.management import call_command

    from .models import JobRun

    _set_job(job_id, status=JobRun.Status.RUNNING, celery_task_id=self.request.id)
    call_command("seed_demo", reset=True)
    _set_job(job_id, status=JobRun.Status.SUCCESS, message="Demo data reset complete.")
    return {"ok": True}


@shared_task(bind=True, name="crm.send_outbound_email")
def send_outbound_email(self, email_message_id: int):
    """Deliver a queued EmailMessage via Django email backend (console/SMTP)."""
    from django.core.mail import EmailMultiAlternatives

    from .automation import create_notification
    from .email_tracking import inject_tracking, text_to_html
    from .models import EmailMessage, Notification
    from .timeline import record_timeline_event

    msg = (
        EmailMessage.objects.select_related(
            "lead", "lead__owner", "opportunity", "opportunity__owner", "contact", "sent_by"
        )
        .filter(pk=email_message_id)
        .first()
    )
    if not msg:
        return {"error": "missing"}
    if msg.status == EmailMessage.Status.SENT:
        return {"id": msg.id, "status": "already_sent"}

    html = msg.body_html or text_to_html(msg.body_text)
    html = inject_tracking(html, msg.tracking_token)
    text = msg.body_text or msg.subject
    try:
        mail = EmailMultiAlternatives(
            subject=msg.subject,
            body=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[msg.to_email],
        )
        mail.attach_alternative(html, "text/html")
        mail.send(fail_silently=False)
        msg.status = EmailMessage.Status.SENT
        msg.sent_at = timezone.now()
        msg.body_html = html
        msg.error = ""
        msg.save(update_fields=["status", "sent_at", "body_html", "error", "updated_at"])
    except Exception as exc:  # noqa: BLE001 — persist failure for UI
        msg.status = EmailMessage.Status.FAILED
        msg.error = str(exc)[:2000]
        msg.save(update_fields=["status", "error", "updated_at"])
        return {"id": msg.id, "status": "failed", "error": msg.error}

    meta = {"id": msg.id, "to": msg.to_email}
    if msg.opportunity_id:
        record_timeline_event(
            entity_type="opportunity",
            entity_id=msg.opportunity_id,
            event_type="email_sent",
            title=f"Email sent: {msg.subject}",
            body=f"To {msg.to_email}",
            actor=msg.sent_by,
            opportunity_id=msg.opportunity_id,
            lead_id=msg.lead_id,
            contact_id=msg.contact_id,
            meta=meta,
        )
    if msg.lead_id:
        record_timeline_event(
            entity_type="lead",
            entity_id=msg.lead_id,
            event_type="email_sent",
            title=f"Email sent: {msg.subject}",
            body=f"To {msg.to_email}",
            actor=msg.sent_by,
            lead_id=msg.lead_id,
            opportunity_id=msg.opportunity_id,
            meta=meta,
        )

    notify_user = msg.sent_by
    if msg.lead_id and msg.lead.owner_id:
        notify_user = msg.lead.owner
    elif msg.opportunity_id and msg.opportunity.owner_id:
        notify_user = msg.opportunity.owner
    if notify_user:
        link = f"/opportunities/{msg.opportunity_id}" if msg.opportunity_id else (
            f"/leads/{msg.lead_id}" if msg.lead_id else "/dashboard"
        )
        create_notification(
            user=notify_user,
            title=f"Email sent: {msg.subject}",
            body=f"Delivered to {msg.to_email}",
            kind=Notification.Kind.EMAIL,
            link=link,
        )
    return {"id": msg.id, "status": "sent"}


@shared_task(bind=True, name="crm.advance_sequence_enrollments")
def advance_sequence_enrollments(self, job_id: int | None = None):
    """
    Advance due email-sequence steps: create EmailMessage to the lead and send via Celery.
    """
    from .automation import create_notification
    from .email_tracking import new_tracking_token, text_to_html
    from .models import EmailMessage, JobRun, Notification, SequenceEnrollment

    _set_job(job_id, status=JobRun.Status.RUNNING, celery_task_id=self.request.id)
    now = timezone.now()
    due = (
        SequenceEnrollment.objects.select_related("sequence", "lead", "lead__owner")
        .filter(status=SequenceEnrollment.Status.ACTIVE, next_run_at__lte=now)
        .order_by("next_run_at")
    )
    advanced = 0
    completed = 0
    for enrollment in due:
        next_order = enrollment.current_step_order + 1
        step = enrollment.sequence.steps.filter(order=next_order).select_related("template").first()
        if step is None:
            enrollment.status = SequenceEnrollment.Status.COMPLETED
            enrollment.last_message = "Sequence completed"
            enrollment.next_run_at = None
            enrollment.save(update_fields=["status", "last_message", "next_run_at", "updated_at"])
            completed += 1
            continue

        template = step.template
        owner = enrollment.lead.owner
        subject = template.subject.replace("{{name}}", enrollment.lead.name).replace(
            "{{company}}", enrollment.lead.company
        )
        body = template.body.replace("{{name}}", enrollment.lead.name).replace(
            "{{company}}", enrollment.lead.company
        )
        msg = EmailMessage.objects.create(
            to_email=enrollment.lead.email,
            subject=subject,
            body_text=body,
            body_html=text_to_html(body),
            status=EmailMessage.Status.QUEUED,
            lead=enrollment.lead,
            enrollment=enrollment,
            template=template,
            sent_by=owner,
            tracking_token=new_tracking_token(),
        )
        send_outbound_email.delay(msg.id)
        create_notification(
            user=owner,
            title=f"Sequence step sent: {enrollment.sequence.name}",
            body=f"“{subject}” → {enrollment.lead.name} <{enrollment.lead.email}>",
            kind=Notification.Kind.SEQUENCE,
            link=f"/leads/{enrollment.lead_id}",
        )

        following = enrollment.sequence.steps.filter(order=next_order + 1).first()
        enrollment.current_step_order = next_order
        if following is None:
            enrollment.status = SequenceEnrollment.Status.COMPLETED
            enrollment.next_run_at = None
            enrollment.last_message = f"Completed step {next_order}: {subject}"
            completed += 1
        else:
            enrollment.next_run_at = now + timedelta(days=following.delay_days)
            enrollment.last_message = f"Completed step {next_order}; next in {following.delay_days}d"
        enrollment.save(
            update_fields=["current_step_order", "status", "next_run_at", "last_message", "updated_at"]
        )
        advanced += 1

    result = {"advanced": advanced, "completed": completed}
    _set_job(
        job_id,
        status=JobRun.Status.SUCCESS,
        message=f"Advanced {advanced} enrollment steps ({completed} completed).",
        result_meta=result,
    )
    return result


@shared_task(bind=True, name="crm.notify_overdue_tasks")
def notify_overdue_tasks(self, job_id: int | None = None):
    from .automation import create_notification
    from .models import JobRun, Notification, Task

    _set_job(job_id, status=JobRun.Status.RUNNING, celery_task_id=self.request.id)
    now = timezone.now()
    overdue = Task.objects.filter(completed=False, due_at__lt=now).select_related("owner")
    created = 0
    for task in overdue:
        already = Notification.objects.filter(
            user=task.owner,
            kind=Notification.Kind.TASK_DUE,
            title=f"Task overdue: {task.title}",
            created_at__gte=now - timedelta(hours=20),
        ).exists()
        if already:
            continue
        if task.opportunity_id:
            link = f"/opportunities/{task.opportunity_id}"
        elif task.lead_id:
            link = "/leads"
        else:
            link = "/tasks"
        create_notification(
            user=task.owner,
            title=f"Task overdue: {task.title}",
            body=task.description[:240],
            kind=Notification.Kind.TASK_DUE,
            link=link,
        )
        created += 1
    result = {"notifications": created}
    _set_job(
        job_id,
        status=JobRun.Status.SUCCESS,
        message=f"Created {created} overdue task notifications.",
        result_meta=result,
    )
    return result


def enqueue_notification(subject: str, message: str, recipient_email: str | None):
    if not recipient_email:
        return
    send_notification_email.delay(subject, message, [recipient_email])


def dashboard_aggregates():
    from .models import Activity, Lead, Opportunity

    open_stages = [
        Opportunity.Stage.DISCOVERY,
        Opportunity.Stage.DEMO,
        Opportunity.Stage.PROPOSAL,
        Opportunity.Stage.NEGOTIATION,
    ]
    pipeline = Opportunity.objects.filter(stage__in=open_stages).aggregate(
        total=Sum("amount"),
        count=Count("id"),
        stale=Count("id", filter=Q(is_stale=True)),
    )
    by_stage = list(
        Opportunity.objects.filter(stage__in=open_stages)
        .values("stage")
        .annotate(count=Count("id"), amount=Sum("amount"))
        .order_by("stage")
    )
    return {
        "pipeline_amount": str(pipeline["total"] or Decimal("0")),
        "open_deals": pipeline["count"] or 0,
        "stale_deals": pipeline["stale"] or 0,
        "leads_open": Lead.objects.exclude(status=Lead.Status.CONVERTED).count(),
        "activities_due": Activity.objects.filter(completed=False, due_at__isnull=False).count(),
        "by_stage": [
            {
                "stage": row["stage"],
                "count": row["count"],
                "amount": str(row["amount"] or 0),
            }
            for row in by_stage
        ],
    }
