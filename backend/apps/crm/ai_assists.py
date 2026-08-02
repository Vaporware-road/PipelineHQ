"""Provider-agnostic AI assists — rules always work; optional LLM when AI_API_KEY is set."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings

from .models import AiSuggestion, EmailTemplate, Lead, Opportunity, Task
from .scoring import score_lead
from .timeline import build_timeline


def _provider_config() -> tuple[str, str, str, str]:
    provider = (getattr(settings, "AI_PROVIDER", None) or "none").lower()
    api_key = getattr(settings, "AI_API_KEY", "") or ""
    model = getattr(settings, "AI_MODEL", "") or "gpt-4o-mini"
    base_url = (getattr(settings, "AI_BASE_URL", "") or "https://api.openai.com/v1").rstrip("/")
    if not api_key:
        provider = "none"
    return provider, api_key, model, base_url


def llm_available() -> bool:
    provider, api_key, _, _ = _provider_config()
    return provider not in {"", "none", "rules"} and bool(api_key)


def call_llm(system: str, user: str) -> str | None:
    """OpenAI-compatible chat completions. Returns None on failure / disabled."""
    provider, api_key, model, base_url = _provider_config()
    if provider in {"", "none", "rules"} or not api_key:
        return None
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }
    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, IndexError, TimeoutError, json.JSONDecodeError):
        return None


def _meddic_snapshot(opp: Opportunity) -> dict[str, str]:
    return {
        "metrics": opp.metrics or "",
        "economic_buyer": opp.economic_buyer or "",
        "decision_criteria": opp.decision_criteria or "",
        "decision_process": opp.decision_process or "",
        "identify_pain": opp.identify_pain or "",
        "champion": opp.champion or "",
    }


def _timeline_blurbs(opportunity_id: int, limit: int = 12) -> list[str]:
    events = build_timeline(opportunity_id=opportunity_id)[:limit]
    out = []
    for ev in events:
        title = ev.get("title") or ev.get("event_type") or "event"
        body = (ev.get("body") or "").strip()
        line = f"- {title}"
        if body:
            line += f": {body[:160]}"
        out.append(line)
    return out


def rule_deal_summary(opp: Opportunity) -> dict[str, Any]:
    meddic = _meddic_snapshot(opp)
    filled = [k for k, v in meddic.items() if v.strip()]
    missing = [k for k, v in meddic.items() if not v.strip()]
    timeline = _timeline_blurbs(opp.id)
    health = opp.health or "unknown"
    lines = [
        f"{opp.name} is in {opp.stage.replace('_', ' ')} "
        f"({opp.forecast_category.replace('_', ' ')}) at ${opp.amount} with health={health}.",
        f"MEDDIC completeness: {len(filled)}/6 filled"
        + (f" — missing {', '.join(missing)}." if missing else "."),
    ]
    if opp.next_step:
        lines.append(f"Logged next step: {opp.next_step}.")
    if opp.is_stale:
        lines.append("Deal is marked stale — activity has gone quiet.")
    if timeline:
        lines.append("Recent timeline:")
        lines.extend(timeline[:6])
    text = "\n".join(lines)
    return {
        "title": f"Summary · {opp.name}",
        "output_text": text,
        "output_json": {
            "stage": opp.stage,
            "health": health,
            "meddic_filled": filled,
            "meddic_missing": missing,
            "timeline_count": len(timeline),
        },
        "prompt_context": {
            "opportunity_id": opp.id,
            "meddic": meddic,
            "timeline": timeline[:8],
        },
        "provider": "rules",
        "model_name": "",
    }


def rule_next_action(opp: Opportunity) -> dict[str, Any]:
    meddic = _meddic_snapshot(opp)
    missing = [k for k, v in meddic.items() if not v.strip()]
    open_tasks = Task.objects.filter(opportunity=opp, completed=False).count()
    suggestions: list[dict[str, str]] = []

    if opp.health in {"at_risk", "stalled"} or opp.is_stale:
        suggestions.append(
            {
                "action": "Book a check-in",
                "why": "Deal health is weak or stale — re-engage the champion this week.",
            }
        )
    if "champion" in missing or "identify_pain" in missing:
        suggestions.append(
            {
                "action": "Complete MEDDIC gaps",
                "why": f"Missing: {', '.join(missing[:3]) or 'key fields'} — blocks Proposal/Negotiation gates.",
            }
        )
    if open_tasks == 0:
        suggestions.append(
            {
                "action": "Create a follow-up task",
                "why": "No open tasks on this deal — put a dated next step on the calendar.",
            }
        )
    if opp.stage in {Opportunity.Stage.PROPOSAL, Opportunity.Stage.NEGOTIATION}:
        suggestions.append(
            {
                "action": "Send or refresh the quote",
                "why": "Commercial stage — keep a current quote in front of the buyer.",
            }
        )
    if not suggestions:
        suggestions.append(
            {
                "action": "Log a discovery call note",
                "why": "Pipeline looks healthy — keep momentum with a short activity update.",
            }
        )

    primary = suggestions[0]
    text = f"Suggested next step: {primary['action']}\nWhy: {primary['why']}"
    if len(suggestions) > 1:
        text += "\n\nAlso consider:\n" + "\n".join(f"• {s['action']} — {s['why']}" for s in suggestions[1:])

    return {
        "title": primary["action"],
        "output_text": text,
        "output_json": {"primary": primary, "alternatives": suggestions[1:]},
        "prompt_context": {
            "opportunity_id": opp.id,
            "stage": opp.stage,
            "health": opp.health,
            "missing_meddic": missing,
            "open_tasks": open_tasks,
        },
        "provider": "rules",
        "model_name": "",
    }


def rule_email_draft(opp: Opportunity, template: EmailTemplate | None = None) -> dict[str, Any]:
    contact_name = ""
    contact_email = ""
    if opp.primary_contact_id and opp.primary_contact:
        contact_name = opp.primary_contact.name
        contact_email = opp.primary_contact.email
    company = opp.account.name if opp.account_id else ""
    name = contact_name or "there"

    if template:
        subject = template.subject.replace("{{name}}", name).replace("{{company}}", company)
        body = template.body.replace("{{name}}", name).replace("{{company}}", company)
        provider = "template"
        title = f"Draft from {template.name}"
    else:
        subject = f"Quick update on {opp.name}"
        body = (
            f"Hi {name},\n\n"
            f"Wanted to share a short update on {opp.name} for {company}. "
            f"We're currently in the {opp.stage.replace('_', ' ')} stage"
            + (f" and our next step is: {opp.next_step}." if opp.next_step else ".")
            + "\n\n"
            f"Would you have 20 minutes this week to align?\n\n"
            f"Thanks,\n"
        )
        provider = "rules"
        title = "Follow-up draft"

    return {
        "title": title,
        "output_text": body,
        "output_json": {
            "subject": subject,
            "body": body,
            "to_email": contact_email,
            "template_id": template.id if template else None,
        },
        "prompt_context": {
            "opportunity_id": opp.id,
            "contact_name": contact_name,
            "company": company,
            "stage": opp.stage,
        },
        "provider": provider,
        "model_name": "",
    }


def enhance_with_llm(kind: str, rules_payload: dict[str, Any], system: str, user: str) -> dict[str, Any]:
    text = call_llm(system, user)
    if not text:
        return rules_payload
    _, _, model, _ = _provider_config()
    provider, _, _, _ = _provider_config()
    out = dict(rules_payload)
    out["output_text"] = text
    out["provider"] = provider
    out["model_name"] = model
    out["output_json"] = {**rules_payload.get("output_json", {}), "llm": True, "rules_fallback": rules_payload.get("output_text")}
    if kind == AiSuggestion.Kind.EMAIL_DRAFT:
        # Best-effort: first line as subject if LLM used Subject: prefix
        subject = rules_payload.get("output_json", {}).get("subject", "")
        body = text
        for line in text.splitlines():
            if line.lower().startswith("subject:"):
                subject = line.split(":", 1)[1].strip()
                body = "\n".join(text.splitlines()[1:]).strip()
                break
        out["output_json"] = {**out["output_json"], "subject": subject, "body": body}
        out["output_text"] = body
    return out


def persist_suggestion(
    *,
    kind: str,
    payload: dict[str, Any],
    opportunity: Opportunity | None = None,
    lead: Lead | None = None,
    user=None,
) -> AiSuggestion:
    return AiSuggestion.objects.create(
        kind=kind,
        opportunity=opportunity,
        lead=lead,
        title=payload.get("title", "")[:255],
        output_text=payload.get("output_text", ""),
        output_json=payload.get("output_json") or {},
        prompt_context=payload.get("prompt_context") or {},
        provider=payload.get("provider", "rules"),
        model_name=payload.get("model_name", ""),
        created_by=user,
    )


def generate_deal_summary(opp: Opportunity, *, user=None, use_llm: bool = True) -> AiSuggestion:
    payload = rule_deal_summary(opp)
    if use_llm and llm_available():
        ctx = payload["prompt_context"]
        user_prompt = (
            f"Deal: {opp.name}\nAccount: {opp.account.name}\nStage: {opp.stage}\n"
            f"Amount: {opp.amount}\nHealth: {opp.health}\nMEDDIC: {json.dumps(ctx['meddic'])}\n"
            f"Timeline:\n" + "\n".join(ctx.get("timeline") or [])
        )
        payload = enhance_with_llm(
            AiSuggestion.Kind.SUMMARY,
            payload,
            "You are a B2B sales coach. Write a concise 4-6 sentence deal summary for an AE.",
            user_prompt,
        )
    return persist_suggestion(kind=AiSuggestion.Kind.SUMMARY, payload=payload, opportunity=opp, user=user)


def generate_next_action(opp: Opportunity, *, user=None, use_llm: bool = True) -> AiSuggestion:
    payload = rule_next_action(opp)
    if use_llm and llm_available():
        user_prompt = (
            f"Deal {opp.name} stage={opp.stage} health={opp.health} next_step={opp.next_step}\n"
            f"Rules suggestion:\n{payload['output_text']}\n"
            "Return one clear next-best action and a one-line why."
        )
        payload = enhance_with_llm(
            AiSuggestion.Kind.NEXT_ACTION,
            payload,
            "You are a sales manager. Recommend the single best next action.",
            user_prompt,
        )
        # Keep title as first line if LLM returns freeform
        first = payload["output_text"].splitlines()[0].strip()
        if first:
            payload["title"] = first[:255]
    return persist_suggestion(kind=AiSuggestion.Kind.NEXT_ACTION, payload=payload, opportunity=opp, user=user)


def generate_email_draft(
    opp: Opportunity,
    *,
    template: EmailTemplate | None = None,
    user=None,
    use_llm: bool = True,
) -> AiSuggestion:
    payload = rule_email_draft(opp, template=template)
    if use_llm and llm_available():
        user_prompt = (
            f"Write a short professional follow-up email for deal {opp.name}. "
            f"Contact={payload['prompt_context'].get('contact_name')}, "
            f"company={payload['prompt_context'].get('company')}, stage={opp.stage}. "
            f"Start with a Subject: line, then the body."
        )
        payload = enhance_with_llm(
            AiSuggestion.Kind.EMAIL_DRAFT,
            payload,
            "You write concise B2B sales emails. Include a Subject: line first.",
            user_prompt,
        )
    return persist_suggestion(kind=AiSuggestion.Kind.EMAIL_DRAFT, payload=payload, opportunity=opp, user=user)


def generate_score_overlay(lead: Lead, *, user=None, use_llm: bool = True) -> AiSuggestion:
    score, reasons = score_lead(lead)
    overlay_points = 0
    detail = "Rule score only (no AI key)."
    provider = "rules"
    model_name = ""

    if use_llm and llm_available():
        prompt = (
            f"Lead {lead.name} @ {lead.company}, title={lead.title}, industry={lead.industry}, "
            f"source={lead.source}, rule_score={score}, reasons={json.dumps(reasons)}. "
            "Reply JSON: {\"delta\": int -10..15, \"detail\": string}."
        )
        raw = call_llm("Return only JSON for a lead score adjustment.", prompt)
        provider, _, model_name, _ = _provider_config()
        if raw:
            try:
                # tolerate fenced JSON
                start = raw.find("{")
                end = raw.rfind("}") + 1
                data = json.loads(raw[start:end])
                overlay_points = max(-10, min(15, int(data.get("delta", 0))))
                detail = str(data.get("detail") or "AI adjustment")
            except (json.JSONDecodeError, TypeError, ValueError):
                overlay_points = 0
                detail = "AI response unparseable; kept rule score."

    adjusted = max(0, min(100, score + overlay_points))
    payload = {
        "title": f"Score overlay · {lead.name}",
        "output_text": f"Rule score {score} → adjusted {adjusted} ({detail})",
        "output_json": {
            "rule_score": score,
            "overlay_points": overlay_points,
            "adjusted_score": adjusted,
            "detail": detail,
            "reasons": reasons + ([{"factor": "ai", "detail": detail, "points": overlay_points}] if overlay_points else []),
        },
        "prompt_context": {"lead_id": lead.id, "rule_score": score},
        "provider": provider if overlay_points or llm_available() else "rules",
        "model_name": model_name,
    }
    return persist_suggestion(kind=AiSuggestion.Kind.SCORE_OVERLAY, payload=payload, lead=lead, user=user)
