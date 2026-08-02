"""Outbound email HTML tracking helpers (pixel + click redirects)."""

from __future__ import annotations

import re
import secrets
from urllib.parse import quote

from django.conf import settings

TRACKING_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01"
    b"\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)

_HREF_RE = re.compile(r'href=(["\'])(https?://.*?)\1', re.IGNORECASE)
_PLAIN_URL_RE = re.compile(r'(?<!["\'>=])(https?://[^\s<]+)', re.IGNORECASE)


def new_tracking_token() -> str:
    return secrets.token_urlsafe(24)


def public_base_url() -> str:
    return getattr(settings, "PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def open_pixel_url(token: str) -> str:
    return f"{public_base_url()}/t/o/{token}/"


def click_redirect_url(token: str, target: str) -> str:
    return f"{public_base_url()}/t/c/{token}/?u={quote(target, safe='')}"


def inject_tracking(html_or_text: str, token: str) -> str:
    """Rewrite http(s) links and append a 1x1 open-tracking pixel."""
    body = html_or_text or ""
    if "<" not in body:
        body = f"<pre style=\"font-family:sans-serif;white-space:pre-wrap\">{body}</pre>"

    # Turn bare URLs into anchors so click tracking can rewrite them
    body = _PLAIN_URL_RE.sub(r'<a href="\1">\1</a>', body)

    def _rewrite(match: re.Match) -> str:
        quote_char = match.group(1)
        url = match.group(2)
        if "/t/o/" in url or "/t/c/" in url:
            return match.group(0)
        return f"href={quote_char}{click_redirect_url(token, url)}{quote_char}"

    body = _HREF_RE.sub(_rewrite, body)
    pixel = f'<img src="{open_pixel_url(token)}" width="1" height="1" alt="" style="display:none" />'
    if "</body>" in body.lower():
        return re.sub(r"</body>", pixel + "</body>", body, count=1, flags=re.IGNORECASE)
    return body + pixel


def text_to_html(text: str) -> str:
    escaped = (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return f'<div style="font-family:sans-serif;white-space:pre-wrap">{escaped}</div>'
