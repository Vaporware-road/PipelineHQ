"""API/integration-ish tests for Telegram Celery notify tasks + signals."""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import User
from apps.crm.models import Account, Lead, Meeting, Opportunity
from apps.telegram.tasks import (
    notify_lead_status_change,
    notify_meeting_status_change,
    notify_opportunity_stage_change,
)


@override_settings(
    TELEGRAM_BOT_TOKEN="123:test",
    TELEGRAM_BOT_USERNAME="TestBot",
    TELEGRAM_WEBAPP_URL="https://example.com/tma",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class TelegramNotifyTaskTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="ae",
            password="demo1234!",
            role=User.Role.AE,
            telegram_id=424242,
        )
        self.unlinked = User.objects.create_user(
            username="sdr",
            password="demo1234!",
            role=User.Role.SDR,
        )
        self.account = Account.objects.create(name="Acme", domain="acme.com", owner=self.owner)

    @patch("apps.telegram.tasks.send_telegram_message", return_value=True)
    def test_notify_lead_status_sends_to_owner(self, mock_send):
        lead = Lead.objects.create(
            name="Ada",
            email="ada@acme.com",
            company="Acme",
            owner=self.owner,
            status=Lead.Status.NEW,
        )
        result = notify_lead_status_change(lead.id, "new", "qualified")
        self.assertTrue(result["ok"])
        mock_send.assert_called_once()
        chat_id, text = mock_send.call_args[0]
        self.assertEqual(chat_id, 424242)
        self.assertIn("qualified", text)
        self.assertIn("startapp=lead_", text)

    @patch("apps.telegram.tasks.send_telegram_message", return_value=True)
    def test_notify_skips_unlinked_owner(self, mock_send):
        lead = Lead.objects.create(
            name="Bob",
            email="bob@acme.com",
            company="Acme",
            owner=self.unlinked,
        )
        result = notify_lead_status_change(lead.id, "new", "contacted")
        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "unlinked")
        mock_send.assert_not_called()

    @patch("apps.telegram.tasks.send_telegram_message", return_value=True)
    def test_notify_opportunity_stage(self, mock_send):
        opp = Opportunity.objects.create(
            name="Big Deal",
            account=self.account,
            owner=self.owner,
            amount=1000,
            stage=Opportunity.Stage.DEMO,
        )
        result = notify_opportunity_stage_change(opp.id, "demo", "proposal")
        self.assertTrue(result["ok"])
        self.assertIn("startapp=opp_", mock_send.call_args[0][1])

    @patch("apps.telegram.tasks.send_telegram_message", return_value=True)
    def test_notify_meeting_status(self, mock_send):
        start = timezone.now()
        meeting = Meeting.objects.create(
            host=self.owner,
            title="Kickoff",
            starts_at=start,
            ends_at=start + timedelta(hours=1),
            invitee_name="Pat",
            invitee_email="pat@acme.com",
            status=Meeting.Status.SCHEDULED,
        )
        result = notify_meeting_status_change(meeting.id, "scheduled", "completed")
        self.assertTrue(result["ok"])
        self.assertIn("startapp=meeting_", mock_send.call_args[0][1])

    @patch("apps.telegram.tasks.notify_lead_status_change.delay")
    def test_signal_enqueues_on_lead_status_save(self, mock_delay):
        lead = Lead.objects.create(
            name="Ada",
            email="ada@acme.com",
            company="Acme",
            owner=self.owner,
            status=Lead.Status.NEW,
        )
        mock_delay.reset_mock()
        lead.status = Lead.Status.CONTACTED
        lead.save()
        mock_delay.assert_called_once_with(lead.id, Lead.Status.NEW, Lead.Status.CONTACTED)

    @patch("apps.telegram.tasks.notify_opportunity_stage_change.delay")
    def test_signal_enqueues_on_opportunity_stage_save(self, mock_delay):
        opp = Opportunity.objects.create(
            name="Deal",
            account=self.account,
            owner=self.owner,
            amount=500,
            stage=Opportunity.Stage.DISCOVERY,
        )
        mock_delay.reset_mock()
        opp.stage = Opportunity.Stage.DEMO
        opp.save()
        mock_delay.assert_called_once_with(
            opp.id,
            Opportunity.Stage.DISCOVERY,
            Opportunity.Stage.DEMO,
        )

    @patch("apps.telegram.tasks.notify_meeting_status_change.delay")
    def test_signal_enqueues_on_meeting_status_save(self, mock_delay):
        start = timezone.now()
        meeting = Meeting.objects.create(
            host=self.owner,
            title="Sync",
            starts_at=start,
            ends_at=start + timedelta(hours=1),
            invitee_name="Pat",
            invitee_email="pat@acme.com",
            status=Meeting.Status.SCHEDULED,
        )
        mock_delay.reset_mock()
        meeting.status = Meeting.Status.CANCELLED
        meeting.save()
        mock_delay.assert_called_once_with(
            meeting.id,
            Meeting.Status.SCHEDULED,
            Meeting.Status.CANCELLED,
        )

    @patch("apps.telegram.tasks.notify_lead_status_change.delay")
    def test_signal_skips_when_status_unchanged(self, mock_delay):
        lead = Lead.objects.create(
            name="Ada",
            email="ada@acme.com",
            company="Acme",
            owner=self.owner,
            status=Lead.Status.NEW,
        )
        mock_delay.reset_mock()
        lead.name = "Ada Lovelace"
        lead.save()
        mock_delay.assert_not_called()
