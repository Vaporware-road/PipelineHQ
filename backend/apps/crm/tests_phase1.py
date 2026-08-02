from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.crm.duplicates import check_duplicates, merge_records
from apps.crm.models import Account, Contact, Lead, Opportunity, TimelineEvent
from apps.crm.timeline import build_timeline


class Phase1RecordsTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username="mgr",
            email="mgr@example.com",
            password="demo1234",
            role=User.Role.MANAGER,
        )
        self.ae = User.objects.create_user(
            username="ae",
            email="ae@example.com",
            password="demo1234",
            role=User.Role.AE,
        )
        self.client = APIClient()

    def test_duplicate_lead_email_match(self):
        Lead.objects.create(
            name="Ada",
            email="ada@acme.com",
            company="Acme",
            owner=self.ae,
        )
        suspects = check_duplicates(entity_type="lead", email="ada@acme.com", name="Ada", company="Acme")
        self.assertTrue(any(s["score"] == 100 for s in suspects))

    def test_merge_contacts_repoints_opportunities(self):
        account = Account.objects.create(name="Acme", domain="acme.com", owner=self.ae)
        winner = Contact.objects.create(account=account, name="Ada", email="ada@acme.com")
        loser = Contact.objects.create(account=account, name="A. Lovelace", email="ada@acme.com")
        opp = Opportunity.objects.create(
            name="Deal",
            account=account,
            primary_contact=loser,
            owner=self.ae,
            amount=1000,
        )
        result = merge_records(
            entity_type="contact",
            winner_id=winner.id,
            loser_id=loser.id,
            actor=self.manager,
        )
        opp.refresh_from_db()
        self.assertEqual(result["winner_id"], winner.id)
        self.assertEqual(opp.primary_contact_id, winner.id)
        self.assertFalse(Contact.objects.filter(pk=loser.id).exists())
        self.assertTrue(
            TimelineEvent.objects.filter(
                entity_type=TimelineEvent.EntityType.CONTACT,
                entity_id=winner.id,
                event_type=TimelineEvent.EventType.MERGED,
            ).exists()
        )

    def test_timeline_includes_activity_and_stage_change(self):
        account = Account.objects.create(name="Acme", domain="acme.com", owner=self.ae)
        contact = Contact.objects.create(account=account, name="Ada", email="ada@acme.com")
        opp = Opportunity.objects.create(
            name="Deal",
            account=account,
            primary_contact=contact,
            owner=self.ae,
            amount=1000,
            stage=Opportunity.Stage.DISCOVERY,
        )
        from apps.crm.models import Activity

        Activity.objects.create(
            opportunity=opp,
            type=Activity.Type.CALL,
            subject="Intro call",
            created_by=self.ae,
        )
        opp._timeline_actor = self.ae
        opp.stage = Opportunity.Stage.DEMO
        opp.save()

        events = build_timeline(opportunity_id=opp.id)
        types = {e["event_type"] for e in events}
        self.assertIn("call", types)
        self.assertIn("stage_change", types)

    def test_api_duplicate_check_and_search_hrefs(self):
        Lead.objects.create(name="Ada", email="ada@acme.com", company="Acme", owner=self.ae)
        account = Account.objects.create(name="Acme", domain="acme.com", owner=self.ae)
        Contact.objects.create(account=account, name="Ada", email="ada@acme.com")

        self.client.force_authenticate(user=self.ae)
        check = self.client.post(
            "/api/duplicates/check/",
            {"entity_type": "lead", "email": "ada@acme.com", "name": "Ada", "company": "Acme"},
            format="json",
        )
        self.assertEqual(check.status_code, 200)
        self.assertGreaterEqual(check.data["count"], 1)

        search = self.client.get("/api/search/?q=Ada")
        self.assertEqual(search.status_code, 200)
        by_type = {}
        for r in search.data["results"]:
            by_type.setdefault(r["type"], []).append(r["href"])
        self.assertTrue(any(h.startswith("/leads/") for h in by_type.get("lead", [])))
        self.assertTrue(any(h.startswith("/contacts/") for h in by_type.get("contact", [])))

        account_search = self.client.get("/api/search/?q=Acme")
        self.assertTrue(
            any(r["type"] == "account" and r["href"].startswith("/accounts/") for r in account_search.data["results"])
        )

    def test_lead_create_blocks_on_duplicate_unless_forced(self):
        Lead.objects.create(name="Ada", email="ada@acme.com", company="Acme", owner=self.ae)
        self.client.force_authenticate(user=self.ae)
        blocked = self.client.post(
            "/api/leads/",
            {"name": "Ada 2", "email": "ada@acme.com", "company": "Acme", "source": "website"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("duplicates", blocked.data)

        forced = self.client.post(
            "/api/leads/",
            {
                "name": "Ada 2",
                "email": "ada@acme.com",
                "company": "Acme",
                "source": "website",
                "force_create": True,
            },
            format="json",
        )
        self.assertEqual(forced.status_code, 201)
