"""WebSocket consumer — JWT via ?token=, user group for notifications + jobs."""

from __future__ import annotations

import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

logger = logging.getLogger(__name__)


@database_sync_to_async
def user_from_token(token: str):
    from apps.accounts.models import User

    try:
        access = AccessToken(token)
        return User.objects.get(pk=access["user_id"])
    except Exception:
        return AnonymousUser()


class RealtimeConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        query = self.scope.get("query_string", b"").decode()
        params = dict(p.split("=", 1) for p in query.split("&") if "=" in p)
        token = params.get("token", "")
        user = await user_from_token(token) if token else AnonymousUser()
        if not user or not getattr(user, "is_authenticated", False):
            await self.close(code=4401)
            return
        self.user = user
        self.group = f"user_{user.id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"event": "connected", "payload": {"user_id": user.id}})

    async def disconnect(self, code):
        group = getattr(self, "group", None)
        if not group or not self.channel_layer:
            return
        try:
            await self.channel_layer.group_discard(group, self.channel_name)
        except Exception:
            logger.debug("group_discard failed during disconnect", exc_info=True)

    async def realtime_event(self, event):
        await self.send_json({"event": event.get("event"), "payload": event.get("payload")})
