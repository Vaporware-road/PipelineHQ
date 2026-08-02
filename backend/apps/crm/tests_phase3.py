from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User

from .deal_health import assess_deal_health
from .models import Account, Lead, Opportunity, Product, Quote, QuoteLineItem
from .scoring import score_lead


class Phase3ScoringHealthTests(APITestCase):
    def setUp(self):
        self.sdr = User.objects.create_user(
            username="sdr", password="demo1234!", role=User.Role.SDR
        )
        self.ae = User.objects.create_user(
            username="ae", password="demo1234!", role=User.Role.AE
        )
        self.manager = User.objects.create_user(
            username="manager", password="demo1234!", role=User.Role.MANAGER
        )

    def test_referral_founder_saas_scores_high(self):
        lead = Lead.objects.create(
            name="Maya Chen",
            email="maya@orbitops.co",
            company="OrbitOps",
            title="Founder",
            industry="SaaS",
            source=Lead.Source.REFERRAL,
            owner=self.sdr,
        )
        score, reasons = score_lead(lead)
        self.assertGreaterEqual(score, 50)
        factors = {r["factor"] for r in reasons}
        self.assertIn("source", factors)
        self.assertIn("title", factors)
        self.assertIn("industry", factors)

    def test_lead_create_persists_score(self):
        self.client.force_authenticate(self.sdr)
        response = self.client.post(
            reverse("lead-list"),
            {
                "name": "Test Lead",
                "email": "t@example.com",
                "company": "Acme",
                "title": "VP Sales",
                "industry": "Fintech",
                "source": Lead.Source.WEBSITE,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertGreater(response.data["score"], 0)
        self.assertTrue(response.data["score_reasons"])

    def test_stale_deal_is_at_risk_or_stalled(self):
        account = Account.objects.create(name="Acme", owner=self.ae)
        opp = Opportunity.objects.create(
            name="Acme deal",
            account=account,
            amount=Decimal("50000"),
            stage=Opportunity.Stage.PROPOSAL,
            owner=self.ae,
            is_stale=True,
            stage_entered_at=timezone.now() - timedelta(days=40),
        )
        health, reasons = assess_deal_health(opp)
        self.assertIn(health, {Opportunity.Health.AT_RISK, Opportunity.Health.STALLED})
        self.assertTrue(reasons)


class Phase3QuotesTests(APITestCase):
    def setUp(self):
        self.ae = User.objects.create_user(
            username="ae", password="demo1234!", role=User.Role.AE
        )
        self.manager = User.objects.create_user(
            username="manager", password="demo1234!", role=User.Role.MANAGER
        )
        self.account = Account.objects.create(name="Acme", owner=self.ae)
        self.opp = Opportunity.objects.create(
            name="Acme annual",
            account=self.account,
            amount=Decimal("40000"),
            stage=Opportunity.Stage.PROPOSAL,
            owner=self.ae,
            stage_entered_at=timezone.now(),
        )
        self.product = Product.objects.create(
            name="Platform",
            sku="PLAT",
            unit_price=Decimal("10000.00"),
        )

    def test_high_discount_requires_approval(self):
        self.client.force_authenticate(self.ae)
        response = self.client.post(
            reverse("quote-list"),
            {
                "opportunity": self.opp.id,
                "name": "Big discount",
                "discount_percent": "25.00",
                "line_items": [
                    {
                        "product": self.product.id,
                        "description": "Platform",
                        "quantity": "1",
                        "unit_price": "10000.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], Quote.Status.PENDING_APPROVAL)
        self.assertTrue(response.data["needs_approval"])
        self.assertEqual(Decimal(response.data["total"]), Decimal("7500.00"))

    def test_ae_cannot_send_pending_quote(self):
        quote = Quote.objects.create(
            opportunity=self.opp,
            name="Pending",
            status=Quote.Status.PENDING_APPROVAL,
            discount_percent=Decimal("30"),
            created_by=self.ae,
        )
        self.client.force_authenticate(self.ae)
        response = self.client.post(reverse("quote-send", args=[quote.id]))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_manager_approves_then_ae_sends(self):
        quote = Quote.objects.create(
            opportunity=self.opp,
            name="Pending",
            status=Quote.Status.PENDING_APPROVAL,
            discount_percent=Decimal("30"),
            created_by=self.ae,
        )
        QuoteLineItem.objects.create(
            quote=quote,
            product=self.product,
            description="Platform",
            quantity=1,
            unit_price=Decimal("10000"),
        )
        self.client.force_authenticate(self.manager)
        response = self.client.post(reverse("quote-approve", args=[quote.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Quote.Status.DRAFT)

        self.client.force_authenticate(self.ae)
        response = self.client.post(reverse("quote-send", args=[quote.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Quote.Status.SENT)

    def test_preview_returns_html(self):
        quote = Quote.objects.create(
            opportunity=self.opp,
            name="Preview me",
            discount_percent=Decimal("5"),
            created_by=self.ae,
        )
        QuoteLineItem.objects.create(
            quote=quote,
            description="Line",
            quantity=2,
            unit_price=Decimal("100"),
        )
        self.client.force_authenticate(self.ae)
        response = self.client.get(reverse("quote-preview", args=[quote.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/html", response["Content-Type"])
        self.assertIn(b"Preview me", response.content)

    def test_product_create_manager_only(self):
        self.client.force_authenticate(self.ae)
        response = self.client.post(
            reverse("product-list"),
            {"name": "X", "unit_price": "1.00"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.manager)
        response = self.client.post(
            reverse("product-list"),
            {"name": "X", "sku": "X1", "unit_price": "1.00"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_at_risk_endpoint(self):
        self.opp.health = Opportunity.Health.AT_RISK
        self.opp.save(update_fields=["health"])
        self.client.force_authenticate(self.ae)
        response = self.client.get(reverse("opportunity-at-risk"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["count"], 1)
        self.assertIn("amount", response.data)
