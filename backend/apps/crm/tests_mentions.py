"""P1: shared Comment model + @role / @@user mention fan-out."""

from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.crm.automation import notify_mentions_in_body
from apps.crm.models import Account, Comment, Lead, Notification, Opportunity


class MentionAndCommentTests(APITestCase):
    def setUp(self):
        self.ae = User.objects.create_user(
            username="ae",
            email="ae@example.com",
            password="demo1234!",
            role=User.Role.AE,
        )
        self.ae2 = User.objects.create_user(
            username="ae2",
            email="ae2@example.com",
            password="demo1234!",
            role=User.Role.AE,
        )
        self.sdr = User.objects.create_user(
            username="sdr",
            email="sdr@example.com",
            password="demo1234!",
            role=User.Role.SDR,
        )
        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="demo1234!",
            role=User.Role.MANAGER,
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

    def test_at_at_username_notifies_user_not_role(self):
        notes = notify_mentions_in_body(
            body=f"Ping @@{self.ae.username} please",
            actor=self.sdr,
            link="/leads/1",
            entity_label="a lead",
        )
        recipients = {n.user_id for n in notes}
        self.assertEqual(recipients, {self.ae.id})

    def test_at_role_notifies_all_with_role(self):
        notes = notify_mentions_in_body(
            body="Need eyes from @AE",
            actor=self.sdr,
            link="/opportunities/1",
            entity_label="a deal",
        )
        recipients = {n.user_id for n in notes}
        self.assertEqual(recipients, {self.ae.id, self.ae2.id})

    def test_at_at_does_not_trigger_role_parse(self):
        """@@ae must not fan out to every AE — only the user named ae."""
        notes = notify_mentions_in_body(
            body=f"Only @@{self.ae.username}",
            actor=self.manager,
            link="/leads/1",
        )
        recipients = {n.user_id for n in notes}
        self.assertEqual(recipients, {self.ae.id})
        self.assertNotIn(self.ae2.id, recipients)

    def test_author_excluded_from_role_mention(self):
        notes = notify_mentions_in_body(
            body="@MANAGER check this",
            actor=self.manager,
            link="/leads/1",
        )
        self.assertEqual(notes, [])

    def test_opportunity_comment_creates_mention_notifications(self):
        self.client.force_authenticate(self.ae)
        res = self.client.post(
            f"/api/opportunities/{self.opp.id}/comments/",
            {"body": f"FYI @@{self.sdr.username} and @MANAGER"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertTrue(Comment.objects.filter(opportunity=self.opp, author=self.ae).exists())
        mentioned = Notification.objects.filter(kind=Notification.Kind.MENTION)
        user_ids = set(mentioned.values_list("user_id", flat=True))
        self.assertIn(self.sdr.id, user_ids)
        self.assertIn(self.manager.id, user_ids)

    def test_lead_comment_thread_reply(self):
        self.client.force_authenticate(self.sdr)
        root = self.client.post(
            f"/api/leads/{self.lead.id}/comments/",
            {"body": "Root note"},
            format="json",
        )
        self.assertEqual(root.status_code, status.HTTP_201_CREATED)
        root_id = root.data["id"]

        reply = self.client.post(
            f"/api/leads/{self.lead.id}/comments/",
            {"body": "Reply note", "parent": root_id},
            format="json",
        )
        self.assertEqual(reply.status_code, status.HTTP_201_CREATED)
        self.assertEqual(reply.data["parent"], root_id)

        listing = self.client.get(f"/api/leads/{self.lead.id}/comments/")
        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listing.data), 1)
        self.assertEqual(listing.data[0]["id"], root_id)
        self.assertEqual(len(listing.data[0]["replies"]), 1)
