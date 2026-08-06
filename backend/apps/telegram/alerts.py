"""Telegram deep-link + alert message helpers (no Bot API I/O)."""

from __future__ import annotations

from django.conf import settings
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


def mini_app_start_link(start_param: str) -> str:
    """
    Build a URL that opens the Mini App with start_param.

    Prefer t.me deep link when bot username is set; otherwise append ?startapp=
    to TELEGRAM_WEBAPP_URL.
    """
    param = (start_param or "").strip()
    username = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
    if username and param:
        return f"https://t.me/{username}?startapp={param}"

    base = (settings.TELEGRAM_WEBAPP_URL or "").strip()
    if not base:
        return ""
    if not param:
        return base

    parsed = urlparse(base)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["startapp"] = param
    return urlunparse(parsed._replace(query=urlencode(query)))


def format_lead_status_alert(
    *,
    lead_id: int,
    name: str,
    old_status: str,
    new_status: str,
) -> tuple[str, str]:
    start = f"lead_{lead_id}"
    link = mini_app_start_link(start)
    text = f"Lead “{name}” status: {old_status} → {new_status}"
    if link:
        text = f"{text}\n{link}"
    return text, start


def format_opportunity_stage_alert(
    *,
    opportunity_id: int,
    name: str,
    old_stage: str,
    new_stage: str,
) -> tuple[str, str]:
    start = f"opp_{opportunity_id}"
    link = mini_app_start_link(start)
    text = f"Deal “{name}” stage: {old_stage} → {new_stage}"
    if link:
        text = f"{text}\n{link}"
    return text, start


def format_meeting_status_alert(
    *,
    meeting_id: int,
    title: str,
    old_status: str,
    new_status: str,
) -> tuple[str, str]:
    start = f"meeting_{meeting_id}"
    link = mini_app_start_link(start)
    text = f"Meeting “{title}” status: {old_status} → {new_status}"
    if link:
        text = f"{text}\n{link}"
    return text, start
