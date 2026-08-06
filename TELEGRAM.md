# Telegram Mini App — PipelineHQ

Docker-first setup for the bot + Mini App. Telegram requires **HTTPS** for Mini Apps; local testing uses a tunnel to the frontend.

## Official links

| Topic | URL |
|-------|-----|
| Mini Apps overview / `Telegram.WebApp` | https://core.telegram.org/bots/webapps |
| `initData` HMAC validation | https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app |
| Bot API | https://core.telegram.org/bots/api |
| Official JS SDK | https://telegram.org/js/telegram-web-app.js |
| Community guides | https://docs.telegram-mini-apps.com |

## BotFather checklist

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` (or reuse an existing bot).
2. Copy the **bot token** → `TELEGRAM_BOT_TOKEN`.
3. Note the **bot username** (without `@`) → `TELEGRAM_BOT_USERNAME` and `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
4. After you have a public HTTPS URL for the Mini App (see tunnel below):
   - Set **Main Mini App** / menu button URL to `https://<tunnel-host>/tma`
   - That same URL goes in `TELEGRAM_WEBAPP_URL`
5. Optional: `/setmenubutton` with `WebAppInfo` pointing at `TELEGRAM_WEBAPP_URL`.

## Environment

Copy from [`.env.example`](.env.example) into `.env` (Compose reads `${TELEGRAM_*}` from the host env / `.env`):

| Variable | Required | Purpose |
|----------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | for real bot / initData | BotFather token; empty = web/worker start fine; `telegram-bot` idles |
| `TELEGRAM_BOT_USERNAME` | recommended | Bot username without `@` |
| `TELEGRAM_WEBAPP_URL` | for Mini App launch | Public HTTPS URL ending in `/tma` |
| `TELEGRAM_BOT_ENABLED` | optional (default `1`) | `0` keeps the bot container idle |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | optional | Frontend deep links (set to the same value as `TELEGRAM_BOT_USERNAME`) |

Missing token must **not** crash `web` / `worker` / `beat` at import. The `telegram-bot` service logs “not configured” and sleeps.

When `TELEGRAM_WEBAPP_URL` is set, Django appends its origin to `CORS_ALLOWED_ORIGINS` automatically (in addition to values in that env var). You can also list the tunnel origin explicitly:

```bash
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://<id>.trycloudflare.com
```

## Docker Compose

Rebuild after dependency or Dockerfile changes (includes `python-telegram-bot`):

```bash
docker compose build web worker beat telegram-bot
docker compose up -d
```

Bring the full stack (including the new service):

```bash
docker compose up -d
# or foreground:
docker compose up
```

Services involved:

| Service | Role |
|---------|------|
| `web` | API; gets `TELEGRAM_*` for later initData auth |
| `worker` / `beat` | Future alerts via Bot API |
| `telegram-bot` | `python manage.py run_telegram_bot` (Phase 1 stub idles without token) |
| `frontend` | Serves `/tma` once Phase 3 lands; tunnel target on `:3000` |

Check the bot container:

```bash
docker compose logs -f telegram-bot
# Expect: TELEGRAM_BOT_TOKEN not set — bot not configured; idling...
```

## HTTPS tunnel → Mini App URL

Telegram Mini Apps only open over HTTPS. Point a tunnel at the frontend container:

```bash
# Host machine (example with cloudflared)
cloudflared tunnel --url http://127.0.0.1:3000
```

Then:

1. Set `TELEGRAM_WEBAPP_URL=https://<id>.trycloudflare.com/tma` in `.env`
2. Restart backend services so settings pick up the URL: `docker compose up -d web worker beat telegram-bot`
3. In BotFather, set Main Mini App + menu button to that same `/tma` URL

ngrok equivalent: `ngrok http 3000` → use the `https://…` host + `/tma`.

## Phase status

- **Phase 1:** env, Compose `telegram-bot`, `apps.telegram` skeleton, `User.telegram_id`, stub `run_telegram_bot`
- **Phase 2:** `validate_init_data` HMAC + `/api/telegram/auth|link|unlink` + tests; `telegram_id` on `/api/auth/me/` and admin
- **Phase 3:** Next.js `/tma` Mini App (synthwave) — home, link, leads, pipeline, schedule, clients + light PATCH
- **Phase 4:** real bot `/start` + menu button; Celery alerts on lead/opp/meeting status/stage with `startapp` deep links

### Phase 4 — Bot + alerts

`telegram-bot` service runs `python manage.py run_telegram_bot`:

- Missing token / `TELEGRAM_BOT_ENABLED=0` → idle (container stays up)
- With token → long-polling; `/start` greets user and sets the chat menu button to `TELEGRAM_WEBAPP_URL`
- On startup, sets the **default** menu button to the Mini App URL when configured

Celery worker tasks (token stays server-side only):

| Change | Task | Deep link |
|--------|------|-----------|
| Lead `status` | `telegram.notify_lead_status_change` | `startapp=lead_<id>` |
| Opportunity `stage` | `telegram.notify_opportunity_stage_change` | `startapp=opp_<id>` |
| Meeting `status` | `telegram.notify_meeting_status_change` | `startapp=meeting_<id>` |

Notifies the lead/opportunity **owner** or meeting **host** when they have `telegram_id` set. Message includes a `t.me/<bot>?startapp=…` link (or `TELEGRAM_WEBAPP_URL?startapp=…` fallback).

### Phase 3 Mini App routes

| Route | Purpose |
|-------|---------|
| `/tma` | Bootstrap + compact dashboard |
| `/tma/link` | Bind Telegram user ↔ PipelineHQ username/password |
| `/tma/leads`, `/tma/leads/[id]` | List + PATCH `status` |
| `/tma/pipeline`, `/tma/opportunities/[id]` | Open deals by stage + PATCH `stage` |
| `/tma/schedule`, `/tma/schedule/[id]` | Upcoming meetings + PATCH `status` |
| `/tma/clients` | Accounts/contacts glance |

Deep links via `start_param` / `?startapp=`: `lead_<id>`, `opp_<id>`, `meeting_<id>`.

Rebuild frontend after route changes:

```bash
docker compose build frontend
docker compose up -d frontend
```

### Phase 2 API

| Method | Path | Auth | Body / result |
|--------|------|------|----------------|
| `POST` | `/api/telegram/auth/` | none | `{ init_data }` → JWT if linked, else `{ needs_link: true, telegram_user }` |
| `POST` | `/api/telegram/link/` | none | `{ init_data, username, password }` → bind `telegram_id` + JWT |
| `POST` | `/api/telegram/unlink/` | JWT | clears `telegram_id` on the current user |

Requires `TELEGRAM_BOT_TOKEN`. Missing token → `503`. Bad/expired `initData` → `401`.
