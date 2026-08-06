from datetime import timedelta
from datetime import time

from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.crm.email_tracking import inject_tracking, new_tracking_token, text_to_html
from apps.crm.models import (
    Account,
    AvailabilitySlot,
    EmailMessage,
    EmailTemplate,
    Lead,
    Meeting,
    Opportunity,
    Sequence,
    SequenceEnrollment,
    SequenceStep,
)
from apps.crm.tasks import advance_sequence_enrollments, send_outbound_email


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    PUBLIC_BASE_URL="http://testserver",
    CELERY_TASK_ALWAYS_EAGER=True,
    CELERY_TASK_EAGER_PROPAGATES=True,
)
class Phase2CommsAPITests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="demo1234!",
            role=User.Role.MANAGER,
            first_name="Morgan",
            booking_slug="morgan-mgr",
        )
        self.ae = User.objects.create_user(
            username="ae",
            email="ae@example.com",
            password="demo1234!",
            role=User.Role.AE,
            first_name="Ava",
            booking_slug="ava-ae",
        )
        self.sdr = User.objects.create_user(
            username="sdr",
            email="sdr@example.com",
            password="demo1234!",
            role=User.Role.SDR,
            booking_slug="sam-sdr",
        )
        self.account = Account.objects.create(name="Acme", domain="acme.test", owner=self.ae)
        self.opp = Opportunity.objects.create(
            name="Acme deal",
            account=self.account,
            amount="5000.00",
            stage=Opportunity.Stage.DISCOVERY,
            owner=self.ae,
            close_date="2030-01-01",
        )
        self.lead = Lead.objects.create(
            name="Pat Prospect",
            email="pat@prospect.test",
            company="ProspectCo",
            owner=self.sdr,
        )

    def test_compose_email_queues_and_sends(self):
        self.client.force_authenticate(self.ae)
        mail.outbox.clear()
        res = self.client.post(
            reverse("email-message-list"),
            {
                "to_email": "buyer@acme.test",
                "subject": "Hello",
                "body": "See https://example.com/pricing",
                "opportunity": self.opp.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        msg = EmailMessage.objects.get(pk=res.data["id"])
        # Eager Celery should have delivered
        send_outbound_email(msg.id)
        msg.refresh_from_db()
        self.assertEqual(msg.status, EmailMessage.Status.SENT)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/t/o/", mail.outbox[0].alternatives[0][0])
        self.assertIn("/t/c/", mail.outbox[0].alternatives[0][0])

    def test_tracking_open_and_click(self):
        token = new_tracking_token()
        msg = EmailMessage.objects.create(
            to_email="buyer@acme.test",
            subject="Tracked",
            body_text="hi",
            body_html=inject_tracking(text_to_html("hi https://example.com"), token),
            status=EmailMessage.Status.SENT,
            opportunity=self.opp,
            sent_by=self.ae,
            tracking_token=token,
            sent_at=timezone.now(),
        )
        open_res = self.client.get(reverse("track-open", args=[token]))
        self.assertEqual(open_res.status_code, 200)
        self.assertEqual(open_res["Content-Type"], "image/gif")
        msg.refresh_from_db()
        self.assertEqual(msg.open_count, 1)
        self.assertIsNotNone(msg.opened_at)

        click_res = self.client.get(reverse("track-click", args=[token]), {"u": "https://example.com"})
        self.assertEqual(click_res.status_code, 302)
        msg.refresh_from_db()
        self.assertEqual(msg.click_count, 1)

    def test_sequence_advance_creates_email_to_lead(self):
        tmpl = EmailTemplate.objects.create(
            name="Intro",
            subject="Hi {{name}}",
            body="Hello {{company}}",
            created_by=self.sdr,
        )
        seq = Sequence.objects.create(name="Warm", is_active=True, created_by=self.sdr)
        SequenceStep.objects.create(sequence=seq, order=1, delay_days=0, template=tmpl)
        SequenceEnrollment.objects.create(
            sequence=seq,
            lead=self.lead,
            status=SequenceEnrollment.Status.ACTIVE,
            current_step_order=0,
            next_run_at=timezone.now() - timedelta(minutes=1),
            enrolled_by=self.sdr,
        )
        mail.outbox.clear()
        result = advance_sequence_enrollments()
        self.assertEqual(result["advanced"], 1)
        msg = EmailMessage.objects.get(lead=self.lead)
        self.assertEqual(msg.to_email, self.lead.email)
        self.assertEqual(msg.subject, "Hi Pat Prospect")
        send_outbound_email(msg.id)
        msg.refresh_from_db()
        self.assertEqual(msg.status, EmailMessage.Status.SENT)

    def test_public_booking_creates_meeting(self):
        AvailabilitySlot.objects.create(
            user=self.manager,
            weekday=0,
            start_time=time(10, 0),
            end_time=time(10, 30),
        )
        # Pick next Monday at 10:00
        now = timezone.localtime()
        days_ahead = (0 - now.weekday()) % 7
        if days_ahead == 0 and now.time() >= time(10, 0):
            days_ahead = 7
        day = (now + timedelta(days=days_ahead)).date()
        starts = timezone.make_aware(timezone.datetime.combine(day, time(10, 0)))
        ends = timezone.make_aware(timezone.datetime.combine(day, time(10, 30)))

        res = self.client.post(
            reverse("public-book", args=["morgan-mgr"]),
            {
                "invitee_name": "Casey Buyer",
                "invitee_email": "casey@buyer.test",
                "starts_at": starts.isoformat(),
                "ends_at": ends.isoformat(),
                "opportunity": self.opp.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(Meeting.objects.filter(host=self.manager, invitee_email="casey@buyer.test").exists())

    def test_only_manager_can_create_meetings(self):
        starts = timezone.now() + timedelta(days=1)
        ends = starts + timedelta(minutes=30)
        payload = {
            "title": "Sync",
            "invitee_name": "Buyer",
            "invitee_email": "buyer@test.com",
            "starts_at": starts.isoformat(),
            "ends_at": ends.isoformat(),
            "target_role": "SDR",
            "job_detail": "Qualify",
        }
        self.client.force_authenticate(self.sdr)
        denied = self.client.post(reverse("meeting-list"), payload, format="json")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.manager)
        ok = self.client.post(reverse("meeting-list"), payload, format="json")
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED, ok.data)
        meeting_id = ok.data["id"]

        patch = self.client.patch(
            reverse("meeting-detail", args=[meeting_id]),
            {"job_detail": "Qualify + discovery notes"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK, patch.data)
        self.assertEqual(patch.data["job_detail"], "Qualify + discovery notes")
        self.assertEqual(Meeting.objects.get(pk=meeting_id).job_detail, "Qualify + discovery notes")

        self.client.force_authenticate(self.sdr)
        visible = self.client.get(reverse("meeting-list"))
        self.assertEqual(visible.status_code, status.HTTP_200_OK)
        ids = [m["id"] for m in visible.data["results"]]
        self.assertIn(meeting_id, ids)

        self.client.force_authenticate(self.ae)
        hidden = self.client.get(reverse("meeting-list"))
        self.assertEqual(hidden.status_code, status.HTTP_200_OK)
        ae_ids = [m["id"] for m in hidden.data["results"]]
        self.assertNotIn(meeting_id, ae_ids)

    def test_non_manager_can_patch_visible_meeting_status_only(self):
        starts = timezone.now() + timedelta(days=2)
        ends = starts + timedelta(minutes=30)
        ae_meeting = Meeting.objects.create(
            host=self.manager,
            title="AE standup",
            invitee_name="Buyer",
            invitee_email="buyer@ae.test",
            starts_at=starts,
            ends_at=ends,
            target_role=Meeting.TargetRole.AE,
            status=Meeting.Status.SCHEDULED,
            job_detail="Discovery",
        )
        sdr_meeting = Meeting.objects.create(
            host=self.manager,
            title="SDR standup",
            invitee_name="Lead",
            invitee_email="lead@sdr.test",
            starts_at=starts + timedelta(hours=1),
            ends_at=ends + timedelta(hours=1),
            target_role=Meeting.TargetRole.SDR,
            status=Meeting.Status.SCHEDULED,
        )

        detail = reverse("meeting-detail", args=[ae_meeting.id])

        self.client.force_authenticate(self.manager)
        mgr = self.client.patch(detail, {"status": "completed"}, format="json")
        self.assertEqual(mgr.status_code, status.HTTP_200_OK, mgr.data)
        self.assertEqual(mgr.data["status"], "completed")
        ae_meeting.status = Meeting.Status.SCHEDULED
        ae_meeting.save(update_fields=["status"])

        self.client.force_authenticate(self.ae)
        ok = self.client.patch(detail, {"status": "completed"}, format="json")
        self.assertEqual(ok.status_code, status.HTTP_200_OK, ok.data)
        self.assertEqual(ok.data["status"], "completed")
        ae_meeting.refresh_from_db()
        self.assertEqual(ae_meeting.status, Meeting.Status.COMPLETED)

        blocked_field = self.client.patch(detail, {"job_detail": "Nope"}, format="json")
        self.assertEqual(blocked_field.status_code, status.HTTP_403_FORBIDDEN)

        blocked_combo = self.client.patch(
            detail,
            {"status": "cancelled", "notes": "extra"},
            format="json",
        )
        self.assertEqual(blocked_combo.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.sdr)
        invisible = self.client.patch(
            reverse("meeting-detail", args=[ae_meeting.id]),
            {"status": "cancelled"},
            format="json",
        )
        self.assertEqual(invisible.status_code, status.HTTP_404_NOT_FOUND)

        sdr_ok = self.client.patch(
            reverse("meeting-detail", args=[sdr_meeting.id]),
            {"status": "cancelled"},
            format="json",
        )
        self.assertEqual(sdr_ok.status_code, status.HTTP_200_OK, sdr_ok.data)
        self.assertEqual(sdr_ok.data["status"], "cancelled")

    def test_timeline_includes_email(self):
        EmailMessage.objects.create(
            to_email="a@b.c",
            subject="On timeline",
            body_text="x",
            status=EmailMessage.Status.SENT,
            opportunity=self.opp,
            sent_by=self.ae,
            tracking_token=new_tracking_token(),
            sent_at=timezone.now(),
        )
        self.client.force_authenticate(self.ae)
        res = self.client.get(reverse("timeline"), {"opportunity": self.opp.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        titles = [e["title"] for e in res.data["results"]]
        self.assertTrue(any("On timeline" in t for t in titles))
