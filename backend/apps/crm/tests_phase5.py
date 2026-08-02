from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User

from .ai_assists import generate_deal_summary, generate_next_action, llm_available
from .models import Account, AiSuggestion, Opportunity


class Phase5AiAssistsTests(APITestCase):
    def setUp(self):
        self.ae = User.objects.create_user(username="ae", password="demo1234!", role=User.Role.AE)
        self.account = Account.objects.create(name="Acme", owner=self.ae)
        self.opp = Opportunity.objects.create(
            name="Acme annual",
            account=self.account,
            amount=25000,
            stage=Opportunity.Stage.PROPOSAL,
            owner=self.ae,
            champion="",
            identify_pain="",
            health=Opportunity.Health.AT_RISK,
            is_stale=True,
        )

    def test_rules_summary_and_next_action_offline(self):
        self.assertFalse(llm_available())
        summary = generate_deal_summary(self.opp, user=self.ae, use_llm=False)
        self.assertEqual(summary.kind, AiSuggestion.Kind.SUMMARY)
        self.assertEqual(summary.provider, "rules")
        self.assertIn("MEDDIC", summary.output_text)

        nba = generate_next_action(self.opp, user=self.ae, use_llm=False)
        self.assertEqual(nba.kind, AiSuggestion.Kind.NEXT_ACTION)
        self.assertTrue(nba.title)

    def test_api_summary_and_apply_next_action(self):
        self.client.force_authenticate(self.ae)
        summary = self.client.post(reverse("opportunity-ai-summary", args=[self.opp.id]), {}, format="json")
        self.assertEqual(summary.status_code, status.HTTP_201_CREATED)
        self.assertEqual(summary.data["kind"], "summary")

        nba = self.client.post(
            reverse("opportunity-ai-next-action", args=[self.opp.id]),
            {"apply": True},
            format="json",
        )
        self.assertEqual(nba.status_code, status.HTTP_201_CREATED)
        self.opp.refresh_from_db()
        self.assertTrue(self.opp.next_step)
        self.assertEqual(self.opp.next_step, nba.data["suggestion"]["title"][:255])

    def test_email_draft_endpoint(self):
        self.client.force_authenticate(self.ae)
        response = self.client.post(
            reverse("opportunity-ai-email-draft", args=[self.opp.id]),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["kind"], "email_draft")
        self.assertIn("subject", response.data["output_json"])


class Phase5LeadScoreOverlayTests(APITestCase):
    def setUp(self):
        self.sdr = User.objects.create_user(username="sdr", password="demo1234!", role=User.Role.SDR)

    def test_score_overlay_keeps_rule_score_without_key(self):
        from .models import Lead

        lead = Lead.objects.create(
            name="Pat",
            email="pat@example.com",
            company="Acme",
            title="VP Sales",
            industry="SaaS",
            source=Lead.Source.REFERRAL,
            owner=self.sdr,
        )
        self.client.force_authenticate(self.sdr)
        response = self.client.post(reverse("lead-ai-score-overlay", args=[lead.id]), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["suggestion"]["kind"], "score_overlay")
        self.assertIn("adjusted_score", response.data["suggestion"]["output_json"])
