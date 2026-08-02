from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User


class AdminUserAPITests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="demo1234!",
            role=User.Role.MANAGER,
            first_name="Morgan",
            last_name="Manager",
        )
        self.manager2 = User.objects.create_user(
            username="manager2",
            email="manager2@example.com",
            password="demo1234!",
            role=User.Role.MANAGER,
            first_name="Casey",
            last_name="Manager",
        )
        self.ae = User.objects.create_user(
            username="ae",
            email="ae@example.com",
            password="demo1234!",
            role=User.Role.AE,
            first_name="Ava",
            last_name="AE",
        )
        self.sdr = User.objects.create_user(
            username="sdr",
            email="sdr@example.com",
            password="demo1234!",
            role=User.Role.SDR,
            first_name="Sam",
            last_name="SDR",
            is_active=False,
        )
        self.list_url = reverse("auth-user-list")

    def detail_url(self, user_id):
        return reverse("auth-user-detail", args=[user_id])

    def test_non_manager_gets_403_on_list(self):
        self.client.force_authenticate(self.ae)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_manager_gets_403_on_create(self):
        self.client.force_authenticate(self.ae)
        response = self.client.post(
            self.list_url,
            {
                "username": "newhire",
                "email": "new@example.com",
                "password": "SecurePass123!",
                "role": User.Role.AE,
                "first_name": "New",
                "last_name": "Hire",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_gets_401(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_manager_lists_active_and_inactive(self):
        self.client.force_authenticate(self.manager)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in response.data["results"]}
        self.assertIn("ae", usernames)
        self.assertIn("sdr", usernames)
        inactive = next(r for r in response.data["results"] if r["username"] == "sdr")
        self.assertFalse(inactive["is_active"])

    def test_manager_creates_user(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post(
            self.list_url,
            {
                "username": "newhire",
                "email": "new@example.com",
                "password": "SecurePass123!",
                "role": User.Role.SDR,
                "first_name": "New",
                "last_name": "Hire",
                "title": "SDR",
                "phone": "555-0100",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["username"], "newhire")
        self.assertEqual(response.data["role"], User.Role.SDR)
        self.assertEqual(response.data["title"], "SDR")
        self.assertNotIn("password", response.data)
        user = User.objects.get(username="newhire")
        self.assertTrue(user.check_password("SecurePass123!"))

    def test_create_requires_password(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post(
            self.list_url,
            {
                "username": "nopass",
                "email": "nopass@example.com",
                "role": User.Role.AE,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_manager_patches_role_and_profile(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.ae.id),
            {
                "role": User.Role.SDR,
                "title": "Outbound AE",
                "phone": "555-0199",
                "first_name": "Ava",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ae.refresh_from_db()
        self.assertEqual(self.ae.role, User.Role.SDR)
        self.assertEqual(self.ae.title, "Outbound AE")
        self.assertEqual(self.ae.phone, "555-0199")

    def test_username_is_immutable_on_patch(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.ae.id),
            {"username": "hacked", "title": "Still AE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ae.refresh_from_db()
        self.assertEqual(self.ae.username, "ae")
        self.assertEqual(self.ae.title, "Still AE")

    def test_manager_can_reset_password_on_patch(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.ae.id),
            {"password": "BrandNewPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ae.refresh_from_db()
        self.assertTrue(self.ae.check_password("BrandNewPass123!"))

    def test_blank_password_on_patch_is_ignored(self):
        self.client.force_authenticate(self.manager)
        old_hash = self.ae.password
        response = self.client.patch(
            self.detail_url(self.ae.id),
            {"password": "", "title": "Kept"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ae.refresh_from_db()
        self.assertEqual(self.ae.password, old_hash)
        self.assertEqual(self.ae.title, "Kept")

    def test_manager_can_deactivate_other_user(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.ae.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ae.refresh_from_db()
        self.assertFalse(self.ae.is_active)

    def test_cannot_deactivate_self(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.manager.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_active", response.data)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.is_active)

    def test_cannot_demote_self(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.manager.id),
            {"role": User.Role.AE},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", response.data)
        self.manager.refresh_from_db()
        self.assertEqual(self.manager.role, User.Role.MANAGER)

    def test_cannot_deactivate_last_active_manager(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.manager2.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # manager is the sole active Sales Manager; inactive manager2 tries to deactivate them
        self.client.force_authenticate(self.manager2)
        response = self.client.patch(
            self.detail_url(self.manager.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_active", response.data)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.is_active)

    def test_cannot_demote_last_active_manager(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.manager2.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.manager2)
        response = self.client.patch(
            self.detail_url(self.manager.id),
            {"role": User.Role.AE},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("role", response.data)
        self.manager.refresh_from_db()
        self.assertEqual(self.manager.role, User.Role.MANAGER)

    def test_can_demote_manager_when_another_remains(self):
        self.client.force_authenticate(self.manager)
        response = self.client.patch(
            self.detail_url(self.manager2.id),
            {"role": User.Role.AE},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.manager2.refresh_from_db()
        self.assertEqual(self.manager2.role, User.Role.AE)

    def test_team_endpoint_returns_active_only(self):
        self.client.force_authenticate(self.ae)
        response = self.client.get(reverse("auth-team"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in response.data}
        self.assertIn("ae", usernames)
        self.assertIn("manager", usernames)
        self.assertNotIn("sdr", usernames)
