# PipelineHQ — Full Technical Structure (Learning Guide)

This document explains **everything that was built** and **why**, so you can extend the system with confidence.

---

## 1. Big picture

```text
Browser (Next.js)
    │  HTTPS/JSON + JWT Bearer token
    │  WebSocket (/ws/realtime/?token=…)  ← notifications + JobRun push
    ▼
Django ASGI (Daphne/Channels)  ──►  PostgreSQL   (source of truth)
    │
    ├─► Redis cache   (dashboard KPIs + analytics)
    ├─► Redis channel layer  (WS fan-out)
    │
    └─► Redis broker  ──► Celery Worker  (emails, CSV, exports, scans, sequences, AI optional)
                              ▲
                         Celery Beat (schedules hourly/nightly tasks)
```

**Idea:** HTTP requests should be *fast*. Anything slow or “fire-and-forget” goes to Celery. Live UI updates use Channels when connected, with HTTP polling as fallback.

---

## 2. Repository layout

```text
Untitled/
├── backend/                 # Django project
│   ├── manage.py
│   ├── config/              # Project settings, URLs, Celery app
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── celery.py        # Celery instance
│   └── apps/
│       ├── accounts/        # Custom User + auth endpoints
│       └── crm/             # Domain + automation + analytics
├── frontend/                # Next.js App Router UI
│   └── src/
│       ├── app/             # Pages (login, dashboard, pipeline…)
│       ├── components/      # Shell, charts, notification bell
│       └── lib/             # api.ts, auth.tsx, types.ts
├── docker-compose.yml
├── Dockerfile.backend
├── requirements.txt
├── README.md
└── LEARNING.md              # this file
```

---

## 3. Backend deep dive

### 3.1 Django project (`config/`)

| File | Job |
|------|-----|
| `settings.py` | Apps, DB, JWT, CORS, Redis cache, Celery config |
| `urls.py` | Routes `/api/...` and Django admin |
| `celery.py` | Creates Celery app; `autodiscover_tasks()` finds `@shared_task` |

**Custom user:** `AUTH_USER_MODEL = "accounts.User"` with a `role` field (`SDR` / `AE` / `MANAGER` codes; UI labels are Sales Development, Account Executive, Sales Manager). Profile fields include `title` and `phone`.

### 3.2 CRM domain model (`apps/crm/models.py`)

Classic Salesforce-like objects plus PipelineHQ upgrades:

| Model | Meaning |
|-------|---------|
| `Lead` | Unqualified person/company interest |
| `Account` | Company |
| `Contact` | Person at a company |
| `Opportunity` | Deal with stage, amount, forecast, **MEDDIC** fields, win/loss reasons |
| `Activity` | Call/email/meeting/note on a deal |
| `DealComment` | Notes on a deal; `@username` mentions → notifications |
| `Task` | Reminders tied to lead/opportunity (also created by sequences) |
| `Notification` | In-app inbox (assignment, mention, stage, sequence, task due) |
| `LeadRoutingRule` | Round-robin auto-assign for new leads (optional territory SDRs) |
| `EmailTemplate` / `Sequence` / `SequenceStep` / `SequenceEnrollment` | Lightweight outbound cadence |
| `EmailMessage` / `Meeting` / `AvailabilitySlot` | Real outbound email + native booking |
| `Product` / `Quote` / `QuoteLineItem` | CPQ-lite quotes with discount approval |
| `Territory` / `CustomFieldDefinition` / `CustomFieldValue` | Regions + EAV custom fields |
| `AuditEvent` | Append-only manager compliance history |
| `AiSuggestion` | Cached AI/rules assists (summary, NBA, email draft, score overlay) |
| `TimelineEvent` | Unified activity feed projection |
| `JobRun` | Tracks async Celery jobs for the UI |

**Lead conversion** (`LeadConvertSerializer`) runs in a **DB transaction**:

1. Create Account  
2. Create Contact  
3. Create Opportunity  
4. Mark Lead `converted` + store FKs  

That atomicity is an important interview talking point.

### 3.3 API layer (DRF)

- **ViewSets** give list/create/retrieve/update/delete for free.
- **Serializers** validate input and shape JSON output.
- **Permissions** (`RoleScopedAccess`, `IsManager`, …):
  - Managers see team-wide data
  - Sales Development / Account Executive mostly see records they own
- **Filters**: `django-filter` + search/ordering on list endpoints.

Important custom actions:

- `POST /api/leads/{id}/convert/`
- `POST /api/leads/{id}/ai-score-overlay/` — rule score + optional LLM delta
- `POST /api/leads/import-csv/` → creates `JobRun` → `import_leads_csv.delay(...)`
- `POST /api/opportunities/{id}/ai-summary/` / `ai-next-action/` / `ai-email-draft/`
- `GET /api/ai-suggestions/` — replay cached assists
- WebSocket `ws/realtime/?token=<JWT>` — live notification + job_update events
- `GET /api/search/?q=` → role-scoped global search (leads, accounts, contacts, deals)
- `GET /api/opportunities/pipeline/` → columns for Kanban
- `GET|POST /api/opportunities/{id}/comments/` → deal comments (+ mention fan-out)
- Richer list filters: leads (`status` multi, owner, created date range); opps (amount range, close date, owner, stale)
- `GET /api/dashboard/` → Redis-cached aggregates
- `GET /api/analytics/overview|funnel|activity/?from=&to=` → date-ranged KPIs
- `POST /api/analytics/export/` → Celery CSV export
- `POST /api/forecast/` → forecast CSV via Celery
- `GET /api/notifications/` + `POST .../mark-read/`
- `GET|PATCH /api/routing-rules/` (manager)
- Sequences / enrollments / email templates under `/api/sequences/`, etc.
- `POST /api/ops/<action>/` → stale-scan / warm-cache / reset-demo / advance-sequences

### 3.4 Automation (`automation.py`)

- **MEDDIC stage gates** — Proposal needs `champion` + `identify_pain`; Negotiation also needs `economic_buyer`; closed won/lost need reasons.
- **Lead routing** — on create without owner, round-robin Sales Development reps and notify assignee.
- **Mentions** — `notify_comment_mentions()` parses `@username` in `DealComment.body`.

### 3.5 Celery tasks (`apps/crm/tasks.py`)

| Task name | Trigger | What it does |
|-----------|---------|--------------|
| `crm.send_notification_email` | Lead create/convert, stage change | Console/SMTP email |
| `crm.import_leads_csv` | CSV import endpoint | Creates leads in bulk |
| `crm.export_forecast_csv` | Manager export | Writes CSV to `media/exports/` |
| `crm.export_analytics_csv` | Reports export | Analytics CSV via Celery |
| `crm.flag_stale_deals` | Beat hourly + Admin → Operations | Sets `Opportunity.is_stale` |
| `crm.warm_dashboard_cache` | Beat nightly + Admin → Operations | Precomputes KPI payloads |
| `crm.advance_sequence_enrollments` | Beat + Admin / Sequences | Creates EmailMessage + Celery send (+ tasks/notifications) |
| `crm.notify_overdue_tasks` | Beat hourly | Notifies owners of overdue incomplete tasks |
| `crm.reset_demo_data` | Admin → Operations | Re-runs `seed_demo --reset` |

**Beat schedules** are stored in DB via `django-celery-beat` (`setup_periodic_tasks` command).

### 3.6 Caching

- Dashboard: `dashboard:user:{id}` in Redis with short TTL; busted on writes.
- Analytics: keys include user + date-range + kind; invalidated on relevant writes.

### 3.7 Auth

1. `POST /api/auth/token/` → access + refresh JWT (SimpleJWT)  
2. Frontend stores tokens as `pipelinehq_access` / `pipelinehq_refresh`  
3. Every API call sends `Authorization: Bearer <token>`  
4. `POST /api/auth/demo-login/` issues tokens for seeded users (portfolio convenience)

---

## 4. Frontend deep dive

### 4.1 Auth flow (`src/lib/auth.tsx`)

`AuthProvider` wraps the app:

- On load: if token exists → `GET /api/auth/me/`
- Login: password or demo role button
- Logout: clear tokens

### 4.2 API client (`src/lib/api.ts`)

Central `api()` helper:

- Prefixes `NEXT_PUBLIC_API_URL`
- Attaches JWT
- Throws `ApiError` on non-2xx
- `apiList()` unwraps DRF pagination `{ results: [...] }`

### 4.3 Pages (App Router)

| Route | Purpose |
|-------|---------|
| `/login` | Demo + password login |
| `/dashboard` | Role-scoped KPIs + date-range analytics charts |
| `/leads` | CRUD + convert + CSV import + advanced filters |
| `/pipeline` | Kanban + stage moves + filters + win/loss close modal |
| `/opportunities/[id]` | Deal fields, MEDDIC checklist, comments, tasks, activity timeline |
| `/tasks` | Mine / overdue / all; complete toggles |
| `/accounts` | Accounts & contacts tables |
| `/sequences` | Templates, sequences, enrollments, advance due steps |
| `/forecast` | Rollups + CSV export (manager) |
| `/reports` | Funnel + activity + CSV export |
| `/jobs` | Poll Celery `JobRun` rows |
| `/profile` | Self-service identity, password, workspace counts |
| `/admin` | Sales Manager hub: Team / Routing / Fields / Territories / Audit / Operations / Jobs |
| `/settings` | Redirects to `/admin` |

`AppShell` is the responsive chrome (mobile menu + desktop nav + **Cmd/Ctrl+K search** + Alerts bell).

---

## 5. Data flow examples (study these)

### A) Convert a lead

```text
UI Convert button
  → POST /api/leads/5/convert/
  → LeadConvertSerializer.save()  [atomic]
  → enqueue_notification.delay(...)
  → JSON { lead, account, contact, opportunity }
Celery worker delivers email (console backend by default; SMTP/Mailtrap via env)
```

### B) CSV import (async)

```text
UI Queue import
  → POST /api/leads/import-csv/  (returns 202 + JobRun)
  → Redis queue
  → Worker import_leads_csv
  → JobRun.status = success
UI Jobs page polls /api/jobs/
```

### C) MEDDIC gate + comment mention

```text
AE tries Proposal without champion
  → PATCH opportunity stage
  → validate_stage_transition → 400 field errors
AE fills checklist, posts comment "@manager ready for review"
  → DealComment created
  → notify_comment_mentions → Notification for manager
Manager Alerts bell shows unread mention
```

### D) Sequence advance

```text
Manager Sequences → Advance due steps
  OR Celery Beat
  → advance_sequence_enrollments
  → EmailMessage queued + send_outbound_email (+ Task/Notification for owner)
```

### E) Stale deals

```text
Celery Beat (hourly) OR Manager "Run stale scan"
  → flag_stale_deals
  → opportunities with no recent activity get is_stale=True
  → Dashboard shows stale count
```

---

## 6. How to extend (practice projects)

Shipped in the portfolio roadmap: real email + tracking, quotes/scoring/health, territories/custom fields/audit, AI assists, and Channels realtime (with HTTP polling fallback).

Still good stretch goals:

1. **Google Calendar OAuth sync** — upgrade first-party booking links to two-way calendar.  
2. **pytest matrix** — lead conversion transaction + MEDDIC permission edges.  
3. **Conversation intelligence** — call notes / recording hooks (Gong-class).  
4. **True inbound email sync** — Gmail/Outlook reply capture beyond manual timeline logs.  
5. **Full RBAC permission matrix** — beyond role codes (`SDR` / `AE` / `MANAGER`).

---

## 7. Interview talking points

- Why separate **Lead** vs **Contact/Account/Opportunity**  
- Why conversion is a **transaction**  
- Why Celery exists (request latency, retries, scheduling)  
- Difference between **broker** (Redis) and **result backend** (`django-db`)  
- How **RBAC** differs for Sales Development vs Account Executive vs Sales Manager (codes stay `SDR` / `AE` / `MANAGER`)  
- How **MEDDIC gates** encode sales process in the API (not only the UI)  
- How Redis caching interacts with invalidation on writes  
- Why JWT on a SPA + CORS configuration is required  
- How **rules-first AI** stays demoable offline, with optional LLM overlay  
- Why WebSockets still keep **HTTP polling fallback** for reliability  

---

## 8. Commands cheat sheet

```bash
# migrations
python manage.py makemigrations
python manage.py migrate

# demo data
python manage.py seed_demo --reset
python manage.py setup_periodic_tasks

# processes
daphne -b 127.0.0.1 -p 8000 config.asgi:application
celery -A config worker -l info
celery -A config beat -l info
npm run dev   # in frontend/
```

You now have the map. Read code in this order for best learning:

1. `apps/crm/models.py`  
2. `apps/crm/serializers.py` (especially convert + MEDDIC validation)  
3. `apps/crm/automation.py` + `analytics.py`  
4. `apps/crm/views.py`  
5. `apps/crm/tasks.py`  
6. `frontend/src/lib/api.ts` + `auth.tsx`  
7. One page at a time: `leads` → `pipeline` → `opportunities/[id]` → `tasks` → `reports` → `settings`
