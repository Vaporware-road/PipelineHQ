# Telegram Mini App — PipelineHQ

Docker-first setup for the bot + Mini App. Telegram requires **HTTPS** for Mini Apps. Local phone testing uses a tunnel to the frontend; the Mini App reaches the API through a same-origin Next.js `/api` proxy so you do **not** need a second tunnel for Django in the default setup.

**Never put `TELEGRAM_BOT_TOKEN` in the frontend.** Token stays on `web` / `worker` / `beat` / `telegram-bot` only.

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
2. Copy the **bot token** → `TELEGRAM_BOT_TOKEN` (backend only).
3. Note the **bot username** (without `@`) → `TELEGRAM_BOT_USERNAME` and `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (username only; used for `t.me` deep links in the Mini App).
4. After you have a public HTTPS URL for the Mini App (see tunnel below):
   - Set **Main Mini App** / menu button URL to `https://<tunnel-host>/tma`
   - That same URL goes in `TELEGRAM_WEBAPP_URL`
5. Optional: `/setmenubutton` with `WebAppInfo` pointing at `TELEGRAM_WEBAPP_URL`. The bot also sets the menu button on `/start` and at startup when the webapp URL is configured.

## Environment

Copy from [`.env.example`](.env.example) into `.env` (Compose reads `${TELEGRAM_*}` from the host env / `.env`):

| Variable | Required | Purpose |
|----------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | for real bot / initData | BotFather token; empty = web/worker start fine; `telegram-bot` idles |
| `TELEGRAM_BOT_USERNAME` | recommended | Bot username without `@` (alerts / deep links server-side) |
| `TELEGRAM_WEBAPP_URL` | for Mini App launch | Public HTTPS URL ending in `/tma` |
| `TELEGRAM_BOT_ENABLED` | optional (default `1`) | `0` keeps the bot container idle |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | optional | Same username; Mini App `t.me/<bot>` links on home |
| `NEXT_PUBLIC_API_URL` | optional | **Leave empty** for same-origin `/api` via Next rewrite (recommended for phone tunnels). Set only if you expose Django on a separate public URL |
| `API_PROXY_TARGET` | Compose default | Django origin for Next rewrites (`http://web:8000` in Compose) |

Missing token must **not** crash `web` / `worker` / `beat` at import. The `telegram-bot` service logs “not configured” and sleeps.

When `TELEGRAM_WEBAPP_URL` is set, Django appends its origin to `CORS_ALLOWED_ORIGINS` automatically. With the default same-origin proxy, the browser talks to the tunnel host only, so CORS is less critical for the Mini App; keep the tunnel origin listed if you use a separate API URL.

```bash
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://<id>.trycloudflare.com
```

## Docker Compose

Rebuild after dependency or Dockerfile changes (includes `python-telegram-bot`):

```bash
docker compose build web worker beat telegram-bot frontend
docker compose up -d
```

Services involved:

| Service | Role |
|---------|------|
| `web` | API + initData auth/link; `TELEGRAM_*` for validation |
| `worker` / `beat` | Celery alerts via Bot API (token server-side only) |
| `telegram-bot` | Long-polling: `/start`, menu button → `TELEGRAM_WEBAPP_URL` |
| `frontend` | Serves `/tma`; rewrites `/api/*` → `web:8000`; tunnel target on `:3000` |

Check the bot container:

```bash
docker compose logs -f telegram-bot
# Without token: TELEGRAM_BOT_TOKEN not set — bot not configured; idling...
# With token: polling / listening for updates
```

## HTTPS tunnel (phone + Telegram)

Telegram Mini Apps only open over HTTPS. Point **one** tunnel at the frontend. The Mini App calls `/api/...` on that same host; Next proxies to Django inside Compose.

```bash
# Host machine
cloudflared tunnel --url http://127.0.0.1:3000
```

Then:

1. Set in `.env`:
   - `TELEGRAM_WEBAPP_URL=https://<id>.trycloudflare.com/tma`
   - Leave `NEXT_PUBLIC_API_URL` empty (Compose default)
   - Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
2. Restart so settings and frontend env pick up changes:
   ```bash
   docker compose up -d web worker beat telegram-bot frontend
   ```
   Rebuild frontend if `NEXT_PUBLIC_*` values changed after an image build that baked them in:
   ```bash
   docker compose build frontend && docker compose up -d frontend
   ```
3. In BotFather, set Main Mini App + menu button to that same `/tma` URL.

ngrok: `ngrok http 3000` → same steps with the `https://…` host + `/tma`.

### Why not `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`?

That URL only works on the machine running Docker. A phone inside Telegram cannot reach your laptop’s loopback. Same-origin `/api` via the tunnel fixes that without exposing `:8000` publicly.

### Optional: second tunnel for the API

If you prefer the browser to call Django directly:

```bash
cloudflared tunnel --url http://127.0.0.1:8000   # API
cloudflared tunnel --url http://127.0.0.1:3000   # Mini App
```

Set `NEXT_PUBLIC_API_URL=https://<api-tunnel-host>` (no path), rebuild/restart `frontend`, and ensure `CORS_ALLOWED_ORIGINS` / `TELEGRAM_WEBAPP_URL` include the Mini App origin.

## Phase status

Phases 1–4 are implemented:

| Phase | What’s live |
|-------|-------------|
| **1** | Env, Compose `telegram-bot`, `apps.telegram`, `User.telegram_id`, docs |
| **2** | `validate_init_data` HMAC + `/api/telegram/auth\|link\|unlink` + tests |
| **3** | Next.js `/tma` Mini App — home, link, leads, pipeline, schedule, clients + light PATCH |
| **4** | Bot `/start` + menu button; Celery alerts on lead/opp/meeting changes with `startapp` deep links |

### Bot + alerts (Phase 4)

`telegram-bot` runs `python manage.py run_telegram_bot`:

- Missing token / `TELEGRAM_BOT_ENABLED=0` → idle (container stays up)
- With token → long-polling; `/start` greets and sets the chat menu button to `TELEGRAM_WEBAPP_URL`
- On startup, sets the **default** menu button to the Mini App URL when configured

Celery worker tasks (token stays server-side only):

| Change | Task | Deep link |
|--------|------|-----------|
| Lead `status` | `telegram.notify_lead_status_change` | `startapp=lead_<id>` |
| Opportunity `stage` | `telegram.notify_opportunity_stage_change` | `startapp=opp_<id>` |
| Meeting `status` | `telegram.notify_meeting_status_change` | `startapp=meeting_<id>` |

Notifies the lead/opportunity **owner** or meeting **host** when they have `telegram_id` set. Message includes a `t.me/<bot>?startapp=…` link (or `TELEGRAM_WEBAPP_URL?startapp=…` fallback).

### Mini App routes (Phase 3)

| Route | Purpose |
|-------|---------|
| `/tma` | Bootstrap + compact dashboard; unlink in header |
| `/tma/link` | Bind Telegram user ↔ PipelineHQ username/password |
| `/tma/leads`, `/tma/leads/[id]` | List + PATCH `status` |
| `/tma/pipeline`, `/tma/opportunities/[id]` | Open deals by stage + PATCH `stage` |
| `/tma/schedule`, `/tma/schedule/[id]` | Upcoming meetings + PATCH `status` (visible meetings; non-managers status-only) |
| `/tma/clients` | Accounts/contacts glance |

Deep links via `start_param` / `?startapp=`: `lead_<id>`, `opp_<id>`, `meeting_<id>`.

### Auth API (Phase 2)

| Method | Path | Auth | Body / result |
|--------|------|------|----------------|
| `POST` | `/api/telegram/auth/` | none | `{ init_data }` → JWT if linked, else `{ needs_link: true, telegram_user }` |
| `POST` | `/api/telegram/link/` | none | `{ init_data, username, password }` → bind `telegram_id` + JWT |
| `POST` | `/api/telegram/unlink/` | JWT | clears `telegram_id` on the current user |

Requires `TELEGRAM_BOT_TOKEN`. Missing token → `503`. Bad/expired `initData` → `401`.
