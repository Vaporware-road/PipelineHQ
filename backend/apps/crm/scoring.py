"""Rule-based lead scoring (Phase 3). Deterministic; AI overlay is Phase 5."""

from __future__ import annotations

from django.db.models import Sum

from .models import EmailMessage, Lead, Meeting, SequenceEnrollment, Task

SOURCE_POINTS = {
    Lead.Source.REFERRAL: 25,
    Lead.Source.EVENT: 18,
    Lead.Source.WEBSITE: 15,
    Lead.Source.OUTBOUND: 10,
    Lead.Source.OTHER: 5,
}

TITLE_KEYWORDS = (
    ("ceo", 20),
    ("cto", 18),
    ("cro", 18),
    ("founder", 18),
    ("vp", 15),
    ("vice president", 15),
    ("director", 12),
    ("head of", 12),
    ("chief", 15),
)

INDUSTRY_KEYWORDS = (
    ("saas", 12),
    ("software", 10),
    ("fintech", 10),
    ("cloud", 8),
    ("analytics", 8),
    ("ai", 8),
    ("healthcare", 6),
    ("retail", 4),
)


def score_lead(lead: Lead) -> tuple[int, list[dict]]:
    reasons: list[dict] = []
    score = 0

    source_pts = SOURCE_POINTS.get(lead.source, 5)
    score += source_pts
    reasons.append({"factor": "source", "detail": lead.source, "points": source_pts})

    title = (lead.title or "").lower()
    title_pts = 0
    matched = []
    for keyword, pts in TITLE_KEYWORDS:
        if keyword in title and pts > title_pts:
            title_pts = pts
            matched = [keyword]
    if title_pts:
        score += title_pts
        reasons.append({"factor": "title", "detail": ", ".join(matched), "points": title_pts})

    industry = (lead.industry or "").lower()
    industry_pts = 0
    industry_hit = ""
    for keyword, pts in INDUSTRY_KEYWORDS:
        if keyword in industry:
            industry_pts = pts
            industry_hit = keyword
            break
    if industry_pts:
        score += industry_pts
        reasons.append({"factor": "industry", "detail": industry_hit, "points": industry_pts})

    task_count = Task.objects.filter(lead=lead).count()
    meeting_count = Meeting.objects.filter(lead=lead).count()
    enrollment_count = SequenceEnrollment.objects.filter(lead=lead).count()
    activity_count = task_count + meeting_count + enrollment_count
    activity_pts = min(activity_count * 4, 20)
    if activity_pts:
        score += activity_pts
        reasons.append(
            {
                "factor": "activity",
                "detail": f"{activity_count} touchpoints",
                "points": activity_pts,
            }
        )

    email_agg = EmailMessage.objects.filter(lead=lead).aggregate(
        opens=Sum("open_count"),
        clicks=Sum("click_count"),
    )
    opens = email_agg["opens"] or 0
    clicks = email_agg["clicks"] or 0
    engagement_pts = min(opens * 3 + clicks * 6, 25)
    if engagement_pts:
        score += engagement_pts
        reasons.append(
            {
                "factor": "email_engagement",
                "detail": f"{opens} opens, {clicks} clicks",
                "points": engagement_pts,
            }
        )

    score = min(int(score), 100)
    return score, reasons


def apply_lead_score(lead: Lead, *, save: bool = True) -> Lead:
    lead.score, lead.score_reasons = score_lead(lead)
    if save:
        lead.save(update_fields=["score", "score_reasons", "updated_at"])
    return lead
