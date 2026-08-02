# PipelineHQ

**B2B sales CRM for SaaS teams** — capture leads, run deals, hit forecast.

A multi-role Salesforce-lite workspace for Sales Development, Account Executive, and Sales Manager. Built as a full-stack portfolio product: Django REST + Celery on Postgres/Redis, and a dark synthwave Next.js client.

[Learning guide](./LEARNING.md) · [Management plan](./managementPlan.md) · [About Vaporware-Road](./frontend/src/app/about/page.tsx)

---

## Why this project

Hiring managers recognize the classic CRM object model. PipelineHQ shows you can ship that model end-to-end — not only CRUD screens, but **process enforcement**, **async jobs**, **role-scoped analytics**, and a polished demo path.

| Role | Job to be done |
|------|----------------|
| **Sales Development** | Own leads, qualify, convert → Account + Contact + Opportunity |
| **Account Executive** | Run pipeline, log activity, fill MEDDIC, close with win/loss reasons |
| **Sales Manager** | Admin hub (team/roles, routing, ops), forecast, export reports |

---

## Stack

| Layer | Choice |
|-------|--------|
| API | Django 5, Django REST Framework, SimpleJWT |
| Jobs | Celery, Celery Beat, Redis broker |
| Data | PostgreSQL |
| Cache | Redis (dashboard + analytics) |
| UI | Next.js 15, TypeScript, Tailwind |
| Deploy story | Docker Compose (`db`, `redis`, `web`, `worker`, `beat`, `frontend`) |

---

## Features

- **Lead → opportunity conversion** in one DB transaction  
- **Pipeline board** with stage moves, filters, and win/loss close modal  
- **MEDDIC stage gates** (API-enforced, not UI-only)  
- **Deal comments** with `@username` mentions → in-app alerts  
- **Tasks** (deal/lead/sequence-driven) + overdue notifications  
- **Global search** (⌘K / Ctrl+K)  
- **Lead routing** (round-robin Sales Development)  
- **Email sequences** (templates + enrollments + Beat advance)  
- **Analytics & Reports** (date-ranged KPIs, funnel, activity, CSV export)  
- **Profile** — self-service identity, password, workspace counts  
- **Admin hub** — team/roles, routing toggles, ops jobs, job glance  
- **Synthwave UI** — neon chrome, expressive type, About branding page  

---

## Quick start (local)

**Prerequisites:** Python 3.12+, Node 20+, PostgreSQL, Redis.

```bash
# 1) Python
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # adjust DB/Redis if needed

# 2) Database + seed
cd backend
python manage.py migrate
python manage.py seed_demo --reset
python manage.py setup_periodic_tasks
cd ..

# 3) API
cd backend && python manage.py runserver 8000

# 4) Celery worker (required for imports, exports, sequences, reset)
cd backend && celery -A config worker -l info

# 5) Celery beat (hourly stale scan, sequences, overdue tasks)
cd backend && celery -A config beat -l info

# 6) Frontend
cd frontend && npm install && npm run dev
```

Open **http://127.0.0.1:3000**

### Docker Compose

```bash
docker compose up --build
```

Services: `db`, `redis`, `web`, `worker`, `beat`, `frontend`.

---

## Demo logins

Password for all seeded users: `demo1234`

| Username  | Role               |
|-----------|--------------------|
| `sdr`     | Sales Development  |
| `ae`      | Account Executive  |
| `ae2`     | Account Executive  |
| `manager` | Sales Manager      |

Or use the one-click **Demo access** buttons on the login page.

### Suggested walkthrough

1. **Sales Development** — create/convert a lead; open **Profile** (workspace counts); check **Tasks** and the **Alerts** bell.  
2. **Account Executive** — ⌘K search → **Pipeline** → try Proposal without MEDDIC (blocked) → open deal → fill checklist → comment `@manager` → close with a reason.  
3. **Sales Manager** — **Profile** → **Admin** (Team / Routing / Operations / Jobs) → **Sequences** (advance due steps) → **Reports** + **Forecast** → watch **Jobs**.

Seed includes MEDDIC-filled deals, comments with mentions, open/overdue tasks, one sequence enrollment, and sample notifications.

---

## Architecture

```text
Browser (Next.js)
    │  JSON + JWT Bearer
    ▼
Django REST API ──► PostgreSQL
    │
    ├─► Redis cache   (dashboard / analytics)
    │
    └─► Redis broker ──► Celery worker
                              ▲
                         Celery Beat
```

HTTP stays fast; imports, exports, emails, sequence advances, stale scans, and demo reset run in Celery.

---

## App routes

| Route | Who | Purpose |
|-------|-----|---------|
| `/login` | Public | Demo role buttons + password login |
| `/profile` | All roles | Self identity, password, workspace counts, notifications |
| `/admin` | Sales Manager | Team / Routing / Operations / Jobs |
| `/settings` | — | Redirects to `/admin` |
| `/dashboard` … `/jobs` | Role-scoped | Core CRM surfaces (see Learning guide) |

Role **codes** stay `SDR` / `AE` / `MANAGER`; the UI always shows professional labels.

---

## API map

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/auth/token/` | JWT username/password |
| POST | `/api/auth/demo-login/` | `{ "role": "SDR\|AE\|MANAGER" }` (codes; UI shows professional labels) |
| GET/PATCH | `/api/auth/me/` | Current user / self profile update |
| POST | `/api/auth/change-password/` | Self password change |
| GET | `/api/auth/me/summary/` | Personal workspace counts |
| GET | `/api/auth/team/` | Active users for filter dropdowns |
| CRUD | `/api/auth/users/` | Sales Manager team admin (list includes inactive) |
| GET | `/api/search/?q=` | Global search |
| CRUD | `/api/leads/` | Convert, CSV import, multi-filters |
| CRUD | `/api/accounts/`, `/api/contacts/` | |
| CRUD | `/api/opportunities/` | Pipeline, comments, amount/date filters |
| CRUD | `/api/activities/`, `/api/tasks/` | `?mine=1`, `?overdue=1` |
| GET | `/api/dashboard/` | Redis-cached KPIs |
| GET/POST | `/api/analytics/<overview\|funnel\|activity\|export>/` | Date-ranged analytics |
| GET/POST | `/api/forecast/` | Manager CSV export |
| GET | `/api/notifications/` | Inbox + mark-read |
| GET/PATCH | `/api/routing-rules/` | Manager lead routing |
| CRUD | `/api/sequences/`, `/api/sequence-enrollments/`, `/api/email-templates/` | |
| GET | `/api/jobs/` | Celery job status |
| POST | `/api/ops/<action>/` | stale-scan, warm-cache, reset-demo, advance-sequences |

---

## Project layout

```text
.
├── backend/            # Django (config + apps/accounts + apps/crm)
├── frontend/           # Next.js App Router UI
├── docker-compose.yml
├── Dockerfile.backend
├── requirements.txt
├── LEARNING.md         # Deep dive for learning / interviews
├── managementPlan.md   # Profile + Admin hub build plan (complete)
└── README.md
```

---

## Resume bullet

> Built **PipelineHQ**, a multi-role B2B SaaS sales CRM with Django REST, JWT RBAC, PostgreSQL, and Celery/Redis for async lead import, notifications, sequence cadence, overdue-task alerts, stale-deal scanning, and forecast/analytics export; shipped a responsive Next.js client with Profile self-service, Sales Manager Admin hub (team/roles, routing, ops), global search, MEDDIC stage gates, deal comments/@mentions, tasks, and pipeline filters.

---

## License / attribution

A [Vaporware-Road](https://github.com/Vaporware-road) product.  
Demo credentials are for local portfolio use only — do not use these passwords in production.
