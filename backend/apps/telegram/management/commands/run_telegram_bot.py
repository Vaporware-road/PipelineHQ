"""
Long-polling Telegram bot process.

When TELEGRAM_BOT_TOKEN is set: /start + Mini App menu button.
Otherwise idle so the container stays healthy.
"""

import logging
import time

from django.conf import settings
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)

_IDLE_SLEEP_SECONDS = 60


class Command(BaseCommand):
    help = "Run the PipelineHQ Telegram bot (long-polling)"

    def handle(self, *args, **options):
        token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
        enabled = settings.TELEGRAM_BOT_ENABLED

        if not enabled:
            self.stdout.write(self.style.WARNING("TELEGRAM_BOT_ENABLED=0 — idling."))
            logger.warning("telegram-bot: disabled via TELEGRAM_BOT_ENABLED; idling")
            self._idle_forever("disabled")
            return

        if not token:
            self.stdout.write(
                self.style.WARNING(
                    "TELEGRAM_BOT_TOKEN not set — bot not configured; idling until configured."
                )
            )
            logger.warning("telegram-bot: TELEGRAM_BOT_TOKEN missing; idling")
            self._idle_forever("not configured")
            return

        from apps.telegram.bot import run_bot_polling

        self.stdout.write(self.style.SUCCESS("Starting Telegram bot long-polling…"))
        if not (settings.TELEGRAM_WEBAPP_URL or "").strip():
            self.stdout.write(
                self.style.WARNING(
                    "TELEGRAM_WEBAPP_URL is empty — /start works but menu button is skipped."
                )
            )
        run_bot_polling(token)

    def _idle_forever(self, reason: str) -> None:
        while True:
            logger.debug("telegram-bot idle (%s)", reason)
            time.sleep(_IDLE_SLEEP_SECONDS)
