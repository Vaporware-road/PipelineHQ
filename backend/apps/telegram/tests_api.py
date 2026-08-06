"""API tests for Telegram auth / link / unlink."""

import time

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.telegram.validation import build_init_data_for_tests

BOT_TOKEN = "123456:ABC-DEF_phase2-test"


@override_settings(TELEGRAM_BOT_TOKEN=BOT_TOKEN)
class TelegramAuthAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ae",
            email="ae@example.com",
            password="demo1234!",
            role=User.Role.AE,
            first_name="Ava",
            last_name="AE",
        )
        self.auth_url = reverse("telegram-auth")
        self.link_url = reverse("telegram-link")
        self.unlink_url = reverse("telegram-unlink")
        self.me_url = reverse("auth-me")

    def _init_data(self, telegram_id: int = 9001, **user_extra):
        return build_init_data_for_tests(
            BOT_TOKEN,
            user={
                "id": telegram_id,
                "first_name": "Tele",
                "username": "tele_user",
                **user_extra,
            },
            auth_date=int(time.time()),
        )

    def test_auth_needs_link_when_unlinked(self):
        res = self.client.post(
            self.auth_url,
            {"init_data": self._init_data()},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["needs_link"])
        self.assertEqual(res.data["telegram_user"]["id"], 9001)
        self.assertNotIn("access", res.data)

    def test_auth_returns_jwt_when_linked(self):
        self.user.telegram_id = 9001
        self.user.save(update_fields=["telegram_id"])
        res = self.client.post(
            self.auth_url,
            {"init_data": self._init_data()},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["needs_link"])
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertEqual(res.data["user"]["username"], "ae")
        self.assertEqual(res.data["user"]["telegram_id"], 9001)

    def test_auth_rejects_bad_hash(self):
        res = self.client.post(
            self.auth_url,
            {"init_data": "auth_date=1&user=%7B%22id%22%3A1%7D&hash=deadbeef"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_link_binds_telegram_id_and_returns_jwt(self):
        res = self.client.post(
            self.link_url,
            {
                "init_data": self._init_data(9001),
                "username": "ae",
                "password": "demo1234!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertFalse(res.data["needs_link"])
        self.user.refresh_from_db()
        self.assertEqual(self.user.telegram_id, 9001)

    def test_link_rejects_bad_password(self):
        res = self.client.post(
            self.link_url,
            {
                "init_data": self._init_data(),
                "username": "ae",
                "password": "wrong-password",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_link_conflict_when_telegram_id_taken(self):
        other = User.objects.create_user(
            username="sdr",
            email="sdr@example.com",
            password="demo1234!",
            role=User.Role.SDR,
            telegram_id=9001,
        )
        res = self.client.post(
            self.link_url,
            {
                "init_data": self._init_data(9001),
                "username": "ae",
                "password": "demo1234!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.telegram_id)
        other.refresh_from_db()
        self.assertEqual(other.telegram_id, 9001)

    def test_auth_then_link_flow(self):
        auth = self.client.post(
            self.auth_url,
            {"init_data": self._init_data(4242)},
            format="json",
        )
        self.assertTrue(auth.data["needs_link"])
        linked = self.client.post(
            self.link_url,
            {
                "init_data": self._init_data(4242),
                "username": "ae",
                "password": "demo1234!",
            },
            format="json",
        )
        self.assertEqual(linked.status_code, status.HTTP_200_OK)
        again = self.client.post(
            self.auth_url,
            {"init_data": self._init_data(4242)},
            format="json",
        )
        self.assertFalse(again.data["needs_link"])
        self.assertEqual(again.data["user"]["id"], self.user.id)

    def test_unlink_clears_telegram_id(self):
        self.user.telegram_id = 9001
        self.user.save(update_fields=["telegram_id"])
        self.client.force_authenticate(self.user)
        res = self.client.post(self.unlink_url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.telegram_id)

    def test_unlink_requires_auth(self):
        res = self.client.post(self.unlink_url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_includes_telegram_id(self):
        self.user.telegram_id = 777
        self.user.save(update_fields=["telegram_id"])
        self.client.force_authenticate(self.user)
        res = self.client.get(self.me_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["telegram_id"], 777)

    @override_settings(TELEGRAM_BOT_TOKEN="")
    def test_auth_unavailable_without_token(self):
        res = self.client.post(
            self.auth_url,
            {"init_data": "anything"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
