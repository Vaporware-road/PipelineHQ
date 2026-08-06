"""Telegram Mini App initData HMAC validation (official WebApp algorithm)."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any
from urllib.parse import parse_qsl, urlencode


class InitDataError(Exception):
    """Base for initData validation failures."""


class InitDataInvalidError(InitDataError):
    """Hash missing, malformed payload, or HMAC mismatch."""


class InitDataExpiredError(InitDataError):
    """auth_date is older than max_age_seconds."""


def validate_init_data(
    init_data: str,
    bot_token: str,
    max_age_seconds: int = 86400,
    *,
    now: int | None = None,
) -> dict[str, Any]:
    """
    Validate Telegram WebApp initData per
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

    Returns parsed fields. JSON fields (`user`, `receiver`, `chat`) are decoded to dicts.
    """
    if not bot_token:
        raise InitDataInvalidError("Bot token is not configured.")
    if not init_data or not isinstance(init_data, str):
        raise InitDataInvalidError("init_data is required.")

    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise InitDataInvalidError("init_data is malformed.") from exc

    parsed: dict[str, str] = dict(pairs)
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise InitDataInvalidError("Missing hash.")

    # Bot-token hash covers all fields except hash (signature is included when present).
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise InitDataInvalidError("Invalid initData hash.")

    auth_date_raw = parsed.get("auth_date")
    if auth_date_raw is None:
        raise InitDataInvalidError("Missing auth_date.")
    try:
        auth_date = int(auth_date_raw)
    except ValueError as exc:
        raise InitDataInvalidError("auth_date is invalid.") from exc

    current = int(time.time()) if now is None else int(now)
    if max_age_seconds >= 0 and current - auth_date > max_age_seconds:
        raise InitDataExpiredError("initData has expired.")
    if auth_date > current + 60:
        # Allow small clock skew forward; reject far-future timestamps.
        raise InitDataInvalidError("auth_date is in the future.")

    result: dict[str, Any] = dict(parsed)
    result["auth_date"] = auth_date
    for json_key in ("user", "receiver", "chat"):
        raw = result.get(json_key)
        if isinstance(raw, str) and raw:
            try:
                result[json_key] = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise InitDataInvalidError(f"{json_key} is not valid JSON.") from exc
    return result


def build_init_data_for_tests(
    bot_token: str,
    *,
    user: dict[str, Any],
    auth_date: int | None = None,
    **extra: str,
) -> str:
    """Build a signed initData query string for unit/API tests."""
    fields: dict[str, str] = {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "user": json.dumps(user, separators=(",", ":")),
        **{k: str(v) for k, v in extra.items()},
    }
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    fields["hash"] = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return urlencode(fields)
