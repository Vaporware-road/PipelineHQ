"""Unit tests for Telegram alert deep links / message formatting."""

from django.test import SimpleTestCase, override_settings

from apps.telegram.alerts import (
    format_lead_status_alert,
    format_meeting_status_alert,
    format_opportunity_stage_alert,
    mini_app_start_link,
)
from apps.telegram.bot import menu_button_for_settings


class AlertHelpersTests(SimpleTestCase):
    @override_settings(TELEGRAM_BOT_USERNAME="PipelineHQBot", TELEGRAM_WEBAPP_URL="")
    def test_tme_deep_link_preferred(self):
        self.assertEqual(
            mini_app_start_link("lead_42"),
            "https://t.me/PipelineHQBot?startapp=lead_42",
        )

    @override_settings(TELEGRAM_BOT_USERNAME="", TELEGRAM_WEBAPP_URL="https://example.com/tma")
    def test_webapp_query_fallback(self):
        self.assertEqual(
            mini_app_start_link("opp_7"),
            "https://example.com/tma?startapp=opp_7",
        )

    @override_settings(TELEGRAM_BOT_USERNAME="", TELEGRAM_WEBAPP_URL="https://example.com/tma?x=1")
    def test_webapp_preserves_existing_query(self):
        link = mini_app_start_link("meeting_3")
        self.assertIn("startapp=meeting_3", link)
        self.assertIn("x=1", link)

    @override_settings(TELEGRAM_BOT_USERNAME="bot", TELEGRAM_WEBAPP_URL="https://example.com/tma")
    def test_lead_alert_includes_link(self):
        text, start = format_lead_status_alert(
            lead_id=9,
            name="Ada",
            old_status="new",
            new_status="qualified",
        )
        self.assertEqual(start, "lead_9")
        self.assertIn("new → qualified", text)
        self.assertIn("startapp=lead_9", text)

    @override_settings(TELEGRAM_BOT_USERNAME="bot")
    def test_opportunity_and_meeting_start_params(self):
        _, opp_start = format_opportunity_stage_alert(
            opportunity_id=2,
            name="Deal",
            old_stage="demo",
            new_stage="proposal",
        )
        _, meeting_start = format_meeting_status_alert(
            meeting_id=5,
            title="Sync",
            old_status="scheduled",
            new_status="completed",
        )
        self.assertEqual(opp_start, "opp_2")
        self.assertEqual(meeting_start, "meeting_5")

    @override_settings(TELEGRAM_WEBAPP_URL="https://tunnel.example/tma")
    def test_menu_button_when_url_set(self):
        button = menu_button_for_settings()
        self.assertIsNotNone(button)
        self.assertEqual(button.web_app.url, "https://tunnel.example/tma")

    @override_settings(TELEGRAM_WEBAPP_URL="")
    def test_menu_button_none_without_url(self):
        self.assertIsNone(menu_button_for_settings())
