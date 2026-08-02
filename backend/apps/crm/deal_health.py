"""Composite deal health beyond is_stale (Phase 3)."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db.models import Max, Sum
from django.utils import timezone

from .models import Activity, EmailMessage, Meeting, Opportunity


def assess_deal_health(opp: Opportunity) -> tuple[str, list[dict]]:
    """
    Returns (health, reasons).
    healthy / at_risk / stalled based on weighted risk points.
    """
    if not opp.is_open:
        return Opportunity.Health.HEALTHY, [{"factor": "closed", "detail": "Deal is closed", "risk": 0}]

    reasons: list[dict] = []
    risk = 0
    now = timezone.now()
    stale_days = getattr(settings, "STALE_DEAL_DAYS", 14)

    stage_start = opp.stage_entered_at or opp.created_at or now
    days_in_stage = max(0, (now - stage_start).days)
    if days_in_stage >= stale_days * 2:
        risk += 35
        reasons.append(
            {"factor": "days_in_stage", "detail": f"{days_in_stage} days in {opp.stage}", "risk": 35}
        )
    elif days_in_stage >= stale_days:
        risk += 20
        reasons.append(
            {"factor": "days_in_stage", "detail": f"{days_in_stage} days in {opp.stage}", "risk": 20}
        )
    else:
        reasons.append(
            {"factor": "days_in_stage", "detail": f"{days_in_stage} days in {opp.stage}", "risk": 0}
        )

    last_activity = Activity.objects.filter(opportunity=opp).aggregate(latest=Max("created_at"))["latest"]
    if last_activity is None:
        risk += 25
        reasons.append({"factor": "activity", "detail": "No activities logged", "risk": 25})
    else:
        idle_days = (now - last_activity).days
        if idle_days >= stale_days:
            risk += 25
            reasons.append({"factor": "activity", "detail": f"Last activity {idle_days}d ago", "risk": 25})
        elif idle_days >= stale_days // 2:
            risk += 12
            reasons.append({"factor": "activity", "detail": f"Last activity {idle_days}d ago", "risk": 12})
        else:
            reasons.append({"factor": "activity", "detail": f"Last activity {idle_days}d ago", "risk": 0})

    if opp.is_stale:
        risk += 15
        reasons.append({"factor": "stale_flag", "detail": "Marked stale by scanner", "risk": 15})

    checklist = opp.meddic_checklist()
    filled = sum(1 for v in checklist.values() if v)
    missing = 6 - filled
    if missing >= 4:
        risk += 20
        reasons.append({"factor": "meddic", "detail": f"{filled}/6 MEDDIC fields", "risk": 20})
    elif missing >= 2:
        risk += 10
        reasons.append({"factor": "meddic", "detail": f"{filled}/6 MEDDIC fields", "risk": 10})
    else:
        reasons.append({"factor": "meddic", "detail": f"{filled}/6 MEDDIC fields", "risk": 0})

    email_agg = EmailMessage.objects.filter(opportunity=opp).aggregate(
        opens=Sum("open_count"),
        clicks=Sum("click_count"),
        sent=Max("sent_at"),
    )
    opens = email_agg["opens"] or 0
    clicks = email_agg["clicks"] or 0
    if email_agg["sent"] and opens == 0 and clicks == 0:
        risk += 10
        reasons.append({"factor": "email", "detail": "Emails sent but no engagement", "risk": 10})
    elif opens or clicks:
        reasons.append(
            {"factor": "email", "detail": f"{opens} opens, {clicks} clicks", "risk": 0}
        )
    else:
        reasons.append({"factor": "email", "detail": "No outbound email yet", "risk": 5})
        risk += 5

    next_meeting = (
        Meeting.objects.filter(
            opportunity=opp,
            status=Meeting.Status.SCHEDULED,
            starts_at__gte=now,
        )
        .order_by("starts_at")
        .first()
    )
    if next_meeting:
        reasons.append(
            {
                "factor": "meeting",
                "detail": f"Next meeting {next_meeting.starts_at.date().isoformat()}",
                "risk": 0,
            }
        )
    else:
        # Late-stage deals without a next meeting are riskier
        if opp.stage in {Opportunity.Stage.PROPOSAL, Opportunity.Stage.NEGOTIATION}:
            risk += 15
            reasons.append({"factor": "meeting", "detail": "No upcoming meeting", "risk": 15})
        else:
            risk += 5
            reasons.append({"factor": "meeting", "detail": "No upcoming meeting", "risk": 5})

    if risk >= 55 or (opp.is_stale and days_in_stage >= stale_days):
        health = Opportunity.Health.STALLED
    elif risk >= 25:
        health = Opportunity.Health.AT_RISK
    else:
        health = Opportunity.Health.HEALTHY

    return health, reasons


def apply_deal_health(opp: Opportunity, *, save: bool = True) -> Opportunity:
    opp.health, opp.health_reasons = assess_deal_health(opp)
    if save:
        opp.save(update_fields=["health", "health_reasons", "updated_at"])
    return opp


def refresh_open_deal_health(*, limit: int | None = None) -> int:
    qs = Opportunity.objects.filter(
        stage__in=[
            Opportunity.Stage.DISCOVERY,
            Opportunity.Stage.DEMO,
            Opportunity.Stage.PROPOSAL,
            Opportunity.Stage.NEGOTIATION,
        ]
    )
    if limit:
        qs = qs[:limit]
    count = 0
    for opp in qs.iterator():
        apply_deal_health(opp, save=True)
        count += 1
    return count
