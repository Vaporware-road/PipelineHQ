"""Build and run the long-polling Telegram bot Application."""

from __future__ import annotations

import logging

from django.conf import settings
from telegram import MenuButtonWebApp, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

logger = logging.getLogger(__name__)


def menu_button_for_settings() -> MenuButtonWebApp | None:
    url = (settings.TELEGRAM_WEBAPP_URL or "").strip()
    if not url:
        return None
    return MenuButtonWebApp(text="Open PipelineHQ", web_app=WebAppInfo(url=url))


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    chat = update.effective_chat
    if chat is None or update.message is None:
        return

    webapp = (settings.TELEGRAM_WEBAPP_URL or "").strip()
    name = user.first_name if user else "there"
    if webapp:
        text = (
            f"Hi {name} — welcome to PipelineHQ.\n"
            f"Open the Mini App tracker:\n{webapp}\n\n"
            "Link your CRM account the first time you open it."
        )
    else:
        text = (
            f"Hi {name} — welcome to PipelineHQ.\n"
            "Mini App URL is not configured yet (TELEGRAM_WEBAPP_URL)."
        )
    await update.message.reply_text(text)

    button = menu_button_for_settings()
    if button is not None:
        try:
            await context.bot.set_chat_menu_button(chat_id=chat.id, menu_button=button)
        except Exception:
            logger.exception("Failed to set chat menu button for chat %s", chat.id)


async def post_init(application: Application) -> None:
    button = menu_button_for_settings()
    if button is None:
        logger.warning("TELEGRAM_WEBAPP_URL unset — skipping default menu button")
        return
    try:
        await application.bot.set_chat_menu_button(menu_button=button)
        logger.info("Default Telegram menu button set to %s", settings.TELEGRAM_WEBAPP_URL)
    except Exception:
        logger.exception("Failed to set default Telegram menu button")


def build_application(token: str) -> Application:
    app = (
        Application.builder()
        .token(token)
        .post_init(post_init)
        .build()
    )
    app.add_handler(CommandHandler("start", start_command))
    return app


def run_bot_polling(token: str) -> None:
    application = build_application(token)
    logger.info("telegram-bot: starting long-polling")
    application.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True)
