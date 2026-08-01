# PipelineHQ

Classic **B2B SaaS sales CRM** (Salesforce-lite) built for a strong resume portfolio:

- **Django 5 + Django REST Framework** — domain models, RBAC, JWT auth
- **Celery + Redis + Celery Beat** — async notifications, CSV import, forecast/analytics export, stale-deal scans, sequence advance, dashboard cache warm
- **PostgreSQL** — relational CRM data
- **Next.js 15 + TypeScript + Tailwind** — responsive UI for SDR / AE / Manager

> Full learning walkthrough of every layer: [LEARNING.md](./LEARNING.md)

---

## Quick start (local — recommended on this machine)

Prerequisites: Python 3.12+, Node 20+, Postgres, Redis.

```bash
# 1) Python deps (already created as .venv if you followed setup)
source .venv/bin/activate
pip install -r requirements.txt

# 2) DB + seed
cd backend
python manage.py migrate
python manage.py seed_demo --reset
python manage.py setup_periodic_tasks
cd ..

# 3) Terminal A — API
cd backend && python manage.py runserver 8000

# 4) Terminal B — Celery worker (required for async jobs)
cd backend && celery -A config worker -l info

# 5) Terminal C — Celery beat (periodic jobs)
cd backend && celery -A config beat -l info

# 6) Terminal D — Frontend
cd frontend && npm install && npm run dev
```

Open **http://127.0.0.1:3000**

### Demo logins

| Username | Role    | Password  |
|----------|---------|-----------|
| `sdr`    | SDR     | `demo1234` |
| `ae`     | AE      | `demo1234` |
| `ae2`    | AE      | `demo1234` |
| `manager`| Manager | `demo1234` |

Or use the one-click **Demo access** buttons on the login page.

---

## What to click for a great demo

1. Login as **SDR** → create/convert a lead (creates Account + Contact + Opportunity). Check **Tasks** and the **Alerts** bell. Use filters on **Leads**.
2. Login as **AE** → press **⌘K / Ctrl+K** to search → **Pipeline** → try **Proposal** without MEDDIC (blocked) → open deal → fill checklist + add a task → post `@manager` comment → close won/lost via the reason modal.
3. Login as **Manager** → **Settings** (lead routing + reset demo) → **Sequences** (advance due steps) → **Reports** (date range + CSV export) → **Forecast** / stale scan → watch **Jobs** + **Alerts**.

Seeded data includes MEDDIC-filled deals, deal comments with mentions, open/overdue tasks, one outbound sequence enrollment, and sample notifications.

---

## API map

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/auth/token/` | JWT username/password |
| POST | `/api/auth/demo-login/` | `{ "role": "SDR\|AE\|MANAGER" }` |
| GET | `/api/auth/me/` | Current user |
| GET | `/api/auth/team/` | Active users for filter dropdowns |
| GET | `/api/search/?q=` | Global search (Cmd/Ctrl+K in UI) |
| CRUD | `/api/leads/` | + `POST .../convert/`, `POST .../import-csv/`, multi-status/date filters |
| CRUD | `/api/accounts/`, `/api/contacts/` | |
| CRUD | `/api/opportunities/` | + `GET .../pipeline/`, `GET\|POST .../comments/`, amount/date filters |
| CRUD | `/api/activities/`, `/api/tasks/` | Tasks: `?mine=1`, `?overdue=1` |
| GET | `/api/dashboard/` | Redis-cached KPIs |
| GET/POST | `/api/analytics/<overview\|funnel\|activity\|export>/` | Date-ranged analytics |
| GET/POST | `/api/forecast/` | POST = async CSV export (manager) |
| GET | `/api/notifications/` | + `mark-read`, `unread-count` |
| GET/PATCH | `/api/routing-rules/` | Manager lead routing |
| CRUD | `/api/sequences/`, `/api/sequence-enrollments/`, `/api/email-templates/` | |
| GET | `/api/jobs/` | Celery job status |
| POST | `/api/ops/stale-scan/` etc. | Manager ops incl. `reset-demo` |

---

## Docker Compose

If Docker is available:

```bash
docker compose up --build
```

Services: `db`, `redis`, `web`, `worker`, `beat`, `frontend`.

---

## Resume bullet (suggested)

> Built PipelineHQ, a multi-role B2B SaaS sales CRM with Django REST, JWT RBAC, PostgreSQL, and Celery/Redis for async lead import, notifications, sequence cadence, overdue-task alerts, stale-deal scanning, and forecast/analytics export; shipped a responsive Next.js client with global search, MEDDIC stage gates, deal comments/@mentions, tasks, pipeline filters, and manager forecasting.
