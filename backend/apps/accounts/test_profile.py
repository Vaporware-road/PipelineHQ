from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.crm.models import Account, Lead, Notification, Opportunity, Task

from .models import User


class MeProfileAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="rep",
            email="rep@example.com",
            password="OldPass123!",
            first_name="Riley",
            last_name="Rep",
            role=User.Role.AE,
            title="Account Executive",
            phone="555-0100",
        )
        self.client.force_authenticate(user=self.user)

    def test_me_returns_profile_fields(self):
        res = self.client.get(reverse("auth-me"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["email"], "rep@example.com")
        self.assertEqual(res.data["title"], "Account Executive")
        self.assertEqual(res.data["phone"], "555-0100")
        self.assertEqual(res.data["role"], User.Role.AE)
        self.assertTrue(res.data["is_active"])

    def test_me_patch_updates_allowed_fields(self):
        res = self.client.patch(
            reverse("auth-me"),
            {
                "first_name": "Updated",
                "last_name": "Name",
                "email": "updated@example.com",
                "title": "Senior AE",
                "phone": "555-9999",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.last_name, "Name")
        self.assertEqual(self.user.email, "updated@example.com")
        self.assertEqual(self.user.title, "Senior AE")
        self.assertEqual(self.user.phone, "555-9999")
        self.assertEqual(self.user.role, User.Role.AE)

    def test_me_patch_ignores_role_and_is_active(self):
        res = self.client.patch(
            reverse("auth-me"),
            {"role": User.Role.MANAGER, "is_active": False, "title": "Still AE"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Role.AE)
        self.assertTrue(self.user.is_active)
        self.assertEqual(self.user.title, "Still AE")
        self.assertEqual(res.data["role"], User.Role.AE)
        self.assertTrue(res.data["is_active"])

    def test_change_password_success(self):
        res = self.client.post(
            reverse("auth-change-password"),
            {"current_password": "OldPass123!", "new_password": "NewPass456!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass456!"))

    def test_change_password_rejects_wrong_current(self):
        res = self.client.post(
            reverse("auth-change-password"),
            {"current_password": "wrong", "new_password": "NewPass456!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass123!"))

    def test_me_summary_counts_personal_workspace(self):
        other = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="OtherPass123!",
            role=User.Role.AE,
        )
        Lead.objects.create(
            name="Mine open",
            email="a@ex.com",
            company="Acme",
            owner=self.user,
            status=Lead.Status.NEW,
        )
        Lead.objects.create(
            name="Mine converted",
            email="b@ex.com",
            company="Acme",
            owner=self.user,
            status=Lead.Status.CONVERTED,
        )
        Lead.objects.create(
            name="Other lead",
            email="c@ex.com",
            company="Beta",
            owner=other,
            status=Lead.Status.NEW,
        )
        account = Account.objects.create(name="Acme", domain="acme.test", owner=self.user)
        Opportunity.objects.create(
            name="Open deal",
            account=account,
            amount="1000.00",
            stage=Opportunity.Stage.DISCOVERY,
            owner=self.user,
            close_date="2030-01-01",
        )
        Opportunity.objects.create(
            name="Won deal",
            account=account,
            amount="2000.00",
            stage=Opportunity.Stage.CLOSED_WON,
            owner=self.user,
            close_date="2030-01-01",
        )
        Task.objects.create(title="Open task", owner=self.user, completed=False)
        Task.objects.create(title="Done task", owner=self.user, completed=True)
        Notification.objects.create(
            user=self.user, title="Hi", body="", kind=Notification.Kind.OTHER, is_read=False
        )
        Notification.objects.create(
            user=self.user, title="Old", body="", kind=Notification.Kind.OTHER, is_read=True
        )
        Notification.objects.create(
            user=other, title="Other", body="", kind=Notification.Kind.OTHER, is_read=False
        )

        res = self.client.get(reverse("auth-me-summary"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["open_leads"], 1)
        self.assertEqual(res.data["open_opportunities"], 1)
        self.assertEqual(res.data["open_tasks"], 1)
        self.assertEqual(res.data["unread_notifications"], 1)
