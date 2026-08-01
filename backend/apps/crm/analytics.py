"""Role-scoped analytics aggregates with Redis caching by date range."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts.models import User

from .models import Activity, Lead, Opportunity
from .services import OPEN_STAGES, _scope_leads, _scope_opps


def parse_date_range(raw_from: str | None, raw_to: str | None) -> tuple[datetime, datetime]:
    """Return inclusive [start, end) datetimes in the current timezone."""
    today = timezone.localdate()
    end_date = _parse_date(raw_to) or today
    start_date = _parse_date(raw_from) or (end_date - timedelta(days=29))
    if start_date > end_date:
        start_date, end_date = end_date, start_date
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(start_date, time.min), tz)
    end = timezone.make_aware(datetime.combine(end_date + timedelta(days=1), time.min), tz)
    return start, end


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _range_meta(start: datetime, end: datetime) -> dict:
    """end is exclusive next-day midnight; expose inclusive calendar dates to the API."""
    return {
        "from": start.date().isoformat(),
        "to": (end - timedelta(microseconds=1)).date().isoformat(),
    }


def _cache_key(kind: str, user: User, start: datetime, end: datetime) -> str:
    return f"analytics:{kind}:user:{user.id}:{start.date().isoformat()}:{end.date().isoformat()}"


def invalidate_analytics_cache(user_id: int | None = None) -> None:
    """Best-effort clear; keys are short-TTL so a miss is acceptable if delete_pattern unavailable."""
    if user_id is None:
        return
    # django-redis supports delete_pattern; LocMem/others may not.
    try:
        cache.delete_pattern(f"analytics:*:user:{user_id}:*")  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass


def build_overview(*, user: User, start: datetime, end: datetime) -> dict:
    leads = _scope_leads(Lead.objects.all(), user, user.role).filter(created_at__gte=start, created_at__lt=end)
    opps = _scope_opps(Opportunity.objects.all(), user, user.role)
    closed_in_range = opps.filter(
        stage__in=[Opportunity.Stage.CLOSED_WON, Opportunity.Stage.CLOSED_LOST],
    ).filter(
        Q(closed_at__gte=start, closed_at__lt=end)
        | Q(closed_at__isnull=True, updated_at__gte=start, updated_at__lt=end)
    )

    leads_created = leads.count()
    leads_converted = leads.filter(status=Lead.Status.CONVERTED).count()
    conversion_rate = round((leads_converted / leads_created) * 100, 1) if leads_created else 0.0

    won = closed_in_range.filter(stage=Opportunity.Stage.CLOSED_WON).aggregate(total=Sum("amount"), count=Count("id"))
    lost = closed_in_range.filter(stage=Opportunity.Stage.CLOSED_LOST).aggregate(total=Sum("amount"), count=Count("id"))

    # Cycle = close moment - created_at; prefer closed_at when set.
    cycle_qs = closed_in_range.annotate(
        closed_moment=Coalesce("closed_at", "updated_at"),
    ).annotate(
        cycle=ExpressionWrapper(F("closed_moment") - F("created_at"), output_field=DurationField())
    )
    avg_cycle = cycle_qs.aggregate(avg=Avg("cycle"))["avg"]
    avg_cycle_days = round(avg_cycle.total_seconds() / 86400, 1) if avg_cycle else 0.0

    open_pipeline = opps.filter(stage__in=OPEN_STAGES).aggregate(total=Sum("amount"), count=Count("id"))

    return {
        **_range_meta(start, end),
        "leads_created": leads_created,
        "leads_converted": leads_converted,
        "conversion_rate": conversion_rate,
        "won_amount": str(won["total"] or Decimal("0")),
        "won_count": won["count"] or 0,
        "lost_amount": str(lost["total"] or Decimal("0")),
        "lost_count": lost["count"] or 0,
        "avg_cycle_days": avg_cycle_days,
        "open_pipeline_amount": str(open_pipeline["total"] or Decimal("0")),
        "open_deals": open_pipeline["count"] or 0,
    }


def build_funnel(*, user: User, start: datetime, end: datetime) -> dict:
    leads = _scope_leads(Lead.objects.all(), user, user.role).filter(created_at__gte=start, created_at__lt=end)
    opps = _scope_opps(Opportunity.objects.all(), user, user.role).filter(
        created_at__gte=start, created_at__lt=end
    )

    leads_created = leads.count()
    leads_converted = leads.filter(status=Lead.Status.CONVERTED).count()

    stage_order = [s for s, _ in Opportunity.Stage.choices]
    counts = {
        row["stage"]: row["count"]
        for row in opps.values("stage").annotate(count=Count("id"))
    }
    stages = [{"stage": s, "count": counts.get(s, 0)} for s in stage_order]

    return {
        **_range_meta(start, end),
        "leads_created": leads_created,
        "leads_converted": leads_converted,
        "lead_to_opp_rate": round((leads_converted / leads_created) * 100, 1) if leads_created else 0.0,
        "stages": stages,
        "opportunities_created": opps.count(),
    }


def build_activity_report(*, user: User, start: datetime, end: datetime) -> dict:
    activities = Activity.objects.filter(created_at__gte=start, created_at__lt=end).select_related(
        "created_by", "opportunity"
    )
    if user.role != User.Role.MANAGER:
        activities = activities.filter(Q(created_by=user) | Q(opportunity__owner=user))

    by_type = list(
        activities.values("type").annotate(count=Count("id")).order_by("type")
    )
    by_user = list(
        activities.values("created_by_id", "created_by__username")
        .annotate(count=Count("id"))
        .order_by("-count", "created_by__username")
    )

    return {
        **_range_meta(start, end),
        "total": activities.count(),
        "by_type": [{"type": r["type"], "count": r["count"]} for r in by_type],
        "by_user": [
            {
                "user_id": r["created_by_id"],
                "username": r["created_by__username"],
                "count": r["count"],
            }
            for r in by_user
        ],
    }


def get_analytics(kind: str, user: User, start: datetime, end: datetime) -> dict:
    builders = {
        "overview": build_overview,
        "funnel": build_funnel,
        "activity": build_activity_report,
    }
    if kind not in builders:
        raise ValueError(f"Unknown analytics kind: {kind}")
    key = _cache_key(kind, user, start, end)
    cached = cache.get(key)
    if cached is not None:
        return cached
    payload = builders[kind](user=user, start=start, end=end)
    ttl = getattr(settings, "ANALYTICS_CACHE_TTL", settings.DASHBOARD_CACHE_TTL)
    cache.set(key, payload, ttl)
    return payload
