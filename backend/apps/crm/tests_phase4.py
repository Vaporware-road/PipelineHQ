from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User

from .models import Account, AuditEvent, CustomFieldDefinition, Lead, Opportunity, Territory


class Phase4CustomFieldsTests(APITestCase):
    def setUp(self):
        self.sdr = User.objects.create_user(username="sdr", password="demo1234!", role=User.Role.SDR)
        self.manager = User.objects.create_user(
            username="manager", password="demo1234!", role=User.Role.MANAGER
        )
        self.definition = CustomFieldDefinition.objects.create(
            entity=CustomFieldDefinition.Entity.LEAD,
            key="budget_range",
            label="Budget range",
            field_type=CustomFieldDefinition.FieldType.SELECT,
            options=["<$10k", "$50k+"],
        )

    def test_manager_can_create_definition(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post(
            reverse("custom-field-list"),
            {
                "entity": "account",
                "key": "employee_count",
                "label": "Employees",
                "field_type": "number",
                "options": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["key"], "employee_count")

    def test_sdr_cannot_create_definition(self):
        self.client.force_authenticate(self.sdr)
        response = self.client.post(
            reverse("custom-field-list"),
            {
                "entity": "lead",
                "key": "x",
                "label": "X",
                "field_type": "text",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_lead_custom_fields_roundtrip_and_filter(self):
        self.client.force_authenticate(self.sdr)
        create = self.client.post(
            reverse("lead-list"),
            {
                "name": "Pat Lee",
                "email": "pat@example.com",
                "company": "Acme",
                "source": Lead.Source.WEBSITE,
                "custom_fields": {"budget_range": "$50k+"},
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create.data["custom_fields"]["budget_range"], "$50k+")

        filtered = self.client.get(
            reverse("lead-list"),
            {"custom_key": "budget_range", "custom_value": "50k"},
        )
        self.assertEqual(filtered.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in filtered.data["results"]]
        self.assertIn(create.data["id"], ids)


class Phase4TerritoryTests(APITestCase):
    def setUp(self):
        self.sdr = User.objects.create_user(username="sdr", password="demo1234!", role=User.Role.SDR)
        self.ae = User.objects.create_user(username="ae", password="demo1234!", role=User.Role.AE)
        self.manager = User.objects.create_user(
            username="manager", password="demo1234!", role=User.Role.MANAGER
        )
        self.west = Territory.objects.create(name="West", region="US-West")
        self.west.members.add(self.sdr, self.ae, self.manager)

    def test_manager_creates_territory_and_assigns_account(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post(
            reverse("territory-list"),
            {
                "name": "East",
                "region": "US-East",
                "industry": "Fintech",
                "member_ids": [self.ae.id],
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        territory_id = response.data["id"]

        account = Account.objects.create(name="Acme", owner=self.ae)
        patch = self.client.patch(
            reverse("account-detail", args=[account.id]),
            {"territory_id": territory_id},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(patch.data["territory"], territory_id)

        filtered = self.client.get(reverse("account-list"), {"territory": territory_id})
        self.assertEqual(filtered.status_code, status.HTTP_200_OK)
        ids = [row["id"] for row in filtered.data["results"]]
        self.assertIn(account.id, ids)


class Phase4AuditTests(APITestCase):
    def setUp(self):
        self.ae = User.objects.create_user(username="ae", password="demo1234!", role=User.Role.AE)
        self.manager = User.objects.create_user(
            username="manager", password="demo1234!", role=User.Role.MANAGER
        )
        self.account = Account.objects.create(name="Acme", owner=self.ae)
        self.opp = Opportunity.objects.create(
            name="Acme deal",
            account=self.account,
            amount=10000,
            stage=Opportunity.Stage.DISCOVERY,
            owner=self.ae,
        )

    def test_stage_change_writes_audit_and_manager_can_list(self):
        self.client.force_authenticate(self.ae)
        response = self.client.patch(
            reverse("opportunity-detail", args=[self.opp.id]),
            {"stage": Opportunity.Stage.DEMO},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        event = AuditEvent.objects.filter(
            entity_type=AuditEvent.EntityType.OPPORTUNITY,
            entity_id=self.opp.id,
            action=AuditEvent.Action.STAGE,
        ).first()
        self.assertIsNotNone(event)
        self.assertIn("stage", event.changes)

        self.client.force_authenticate(self.manager)
        listed = self.client.get(
            reverse("audit-event-list"),
            {"entity_type": "opportunity", "entity_id": self.opp.id},
        )
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(listed.data["count"], 1)

    def test_non_manager_cannot_list_audit(self):
        self.client.force_authenticate(self.ae)
        response = self.client.get(reverse("audit-event-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
