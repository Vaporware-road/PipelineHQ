"""Dashboard / forecast query helpers (sync path + Celery cache warm)."""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Q, Sum

from apps.accounts.models import User

from .models import Activity, Lead, Opportunity


OPEN_STAGES = [
    Opportunity.Stage.DISCOVERY,
    Opportunity.Stage.DEMO,
    Opportunity.Stage.PROPOSAL,
    Opportunity.Stage.NEGOTIATION,
]


def _scope_opps(qs, user: User | None, role: str):
    if user is None:
        return qs
    if role == User.Role.MANAGER:
        return qs
    return qs.filter(owner=user)


def _scope_leads(qs, user: User | None, role: str):
    if user is None:
        return qs
    if role == User.Role.MANAGER:
        return qs
    return qs.filter(owner=user)


def build_dashboard_payload(*, user: User | None, role: str) -> dict:
    opps = _scope_opps(Opportunity.objects.all(), user, role)
    leads = _scope_leads(Lead.objects.all(), user, role)
    activities = Activity.objects.all()
    if user and role != User.Role.MANAGER:
        activities = activities.filter(created_by=user)

    pipeline = opps.filter(stage__in=OPEN_STAGES).aggregate(
        total=Sum("amount"),
        count=Count("id"),
        stale=Count("id", filter=Q(is_stale=True)),
        at_risk=Count(
            "id",
            filter=Q(health__in=[Opportunity.Health.AT_RISK, Opportunity.Health.STALLED]),
        ),
        at_risk_amount=Sum(
            "amount",
            filter=Q(health__in=[Opportunity.Health.AT_RISK, Opportunity.Health.STALLED]),
        ),
    )
    by_stage = list(
        opps.filter(stage__in=OPEN_STAGES)
        .values("stage")
        .annotate(count=Count("id"), amount=Sum("amount"))
        .order_by("stage")
    )
    return {
        "role": role,
        "pipeline_amount": str(pipeline["total"] or Decimal("0")),
        "open_deals": pipeline["count"] or 0,
        "stale_deals": pipeline["stale"] or 0,
        "at_risk_deals": pipeline["at_risk"] or 0,
        "at_risk_amount": str(pipeline["at_risk_amount"] or Decimal("0")),
        "leads_open": leads.exclude(status=Lead.Status.CONVERTED).count(),
        "activities_due": activities.filter(completed=False, due_at__isnull=False).count(),
        "won_amount": str(
            opps.filter(stage=Opportunity.Stage.CLOSED_WON).aggregate(total=Sum("amount"))["total"]
            or Decimal("0")
        ),
        "by_stage": [
            {"stage": r["stage"], "count": r["count"], "amount": str(r["amount"] or 0)}
            for r in by_stage
        ],
    }


def get_dashboard_for_user(user: User) -> dict:
    cache_key = f"dashboard:user:{user.id}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    payload = build_dashboard_payload(user=user, role=user.role)
    cache.set(cache_key, payload, settings.DASHBOARD_CACHE_TTL)
    return payload


def build_forecast_payload(user: User) -> dict:
    qs = Opportunity.objects.filter(stage__in=OPEN_STAGES + [Opportunity.Stage.CLOSED_WON])
    if user.role != User.Role.MANAGER:
        qs = qs.filter(owner=user)

    rows = (
        qs.values("owner_id", "owner__username", "forecast_category")
        .annotate(amount=Sum("amount"), count=Count("id"))
        .order_by("owner__username", "forecast_category")
    )
    by_owner: dict[str, dict] = {}
    totals = {"pipeline": Decimal("0"), "best_case": Decimal("0"), "commit": Decimal("0")}
    for row in rows:
        name = row["owner__username"]
        cat = row["forecast_category"]
        amount = row["amount"] or Decimal("0")
        bucket = by_owner.setdefault(
            name,
            {"owner": name, "owner_id": row["owner_id"], "pipeline": "0", "best_case": "0", "commit": "0", "deals": 0},
        )
        bucket[cat] = str(amount)
        bucket["deals"] += row["count"]
        if cat in totals:
            totals[cat] += amount

    return {
        "totals": {k: str(v) for k, v in totals.items()},
        "by_owner": list(by_owner.values()),
    }
