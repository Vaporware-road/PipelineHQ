"""Unit tests for Telegram initData HMAC validation."""

import time
from urllib.parse import parse_qsl, urlencode

from django.test import SimpleTestCase

from apps.telegram.validation import (
    InitDataExpiredError,
    InitDataInvalidError,
    build_init_data_for_tests,
    validate_init_data,
)

BOT_TOKEN = "123456:ABC-DEF_test-token"


class ValidateInitDataTests(SimpleTestCase):
    def test_accepts_valid_signed_payload(self):
        init_data = build_init_data_for_tests(
            BOT_TOKEN,
            user={"id": 42, "first_name": "Ada", "username": "ada"},
            auth_date=int(time.time()),
        )
        data = validate_init_data(init_data, BOT_TOKEN)
        self.assertEqual(data["user"]["id"], 42)
        self.assertEqual(data["user"]["username"], "ada")
        self.assertIsInstance(data["auth_date"], int)

    def test_rejects_tampered_hash(self):
        init_data = build_init_data_for_tests(
            BOT_TOKEN,
            user={"id": 1, "first_name": "Ada"},
        )
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
        bad_hash = pairs["hash"][:-1] + ("0" if pairs["hash"][-1] != "0" else "1")
        pairs["hash"] = bad_hash
        tampered = urlencode(pairs)
        with self.assertRaises(InitDataInvalidError):
            validate_init_data(tampered, BOT_TOKEN)

    def test_rejects_wrong_bot_token(self):
        init_data = build_init_data_for_tests(
            BOT_TOKEN,
            user={"id": 1, "first_name": "Ada"},
        )
        with self.assertRaises(InitDataInvalidError):
            validate_init_data(init_data, "other-token")

    def test_rejects_expired_auth_date(self):
        now = int(time.time())
        init_data = build_init_data_for_tests(
            BOT_TOKEN,
            user={"id": 1, "first_name": "Ada"},
            auth_date=now - 100_000,
        )
        with self.assertRaises(InitDataExpiredError):
            validate_init_data(init_data, BOT_TOKEN, max_age_seconds=86400, now=now)

    def test_rejects_missing_hash(self):
        with self.assertRaises(InitDataInvalidError):
            validate_init_data("auth_date=1&user=%7B%22id%22%3A1%7D", BOT_TOKEN)

    def test_rejects_empty_token(self):
        with self.assertRaises(InitDataInvalidError):
            validate_init_data("auth_date=1&hash=abc", "")

    def test_constant_time_compare_accepts_matching_hash(self):
        """Round-trip: builder and validator share the official HMAC construction."""
        init_data = build_init_data_for_tests(
            BOT_TOKEN,
            user={"id": 99, "first_name": "Sam"},
            query_id="AAEAAAE",
        )
        data = validate_init_data(init_data, BOT_TOKEN)
        self.assertEqual(data.get("query_id"), "AAEAAAE")
