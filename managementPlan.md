# PipelineHQ Management Plan

Manager Admin hub, professional role labels, and a CRM self-panel for every user. Access for Admin stays on the existing `MANAGER` role (displayed as **Sales Manager**). No full custom RBAC.

**Status: complete** (Phases 1–5 shipped).

---

## Goals

1. Professionalize role display names (keep stable codes).
2. Give every user a self-panel (`/profile`).
3. Give Sales Managers a precise Admin hub (`/admin`) for team/roles + routing + ops + jobs.

## Role rename (all phases use these labels)

| Code (unchanged) | Professional label |
| ---------------- | ------------------ |
| `SDR` | Sales Development |
| `AE` | Account Executive |
| `MANAGER` | Sales Manager |

---

## Phase 1 — Professional roles + foundation ✅

**Outcome:** Roles read professionally everywhere; shared helpers ready for Admin and Profile.

### Backend
- Update `User.Role` choice labels in `backend/apps/accounts/models.py` to the professional strings (codes stay `SDR` / `AE` / `MANAGER`).
- No data migration for role codes.

### Frontend
- Add `ROLE_LABELS` (and optional short blurbs) in `frontend/src/lib/types.ts` or `frontend/src/lib/roles.ts`.
- Use labels in AppShell badge, login demo buttons, owner filters, dashboard subtitle.
- Update login copy: “Log in as Sales Development / Account Executive / Sales Manager”.

### Done when
- UI never shows raw `SDR` / `AE` / `MANAGER` as the primary badge text.
- Permission checks still use the same codes.

---

## Phase 2 — User self-panel (`/profile`) ✅

**Outcome:** Every authenticated user can manage their own CRM profile (HubSpot/Salesforce-style rep settings, not a customer portal).

### Research → v1 sections
1. **Profile** — name, email, job title, phone  
2. **Security** — change password  
3. **Role** — read-only professional label + short capability blurb  
4. **My workspace** — open leads / opportunities / tasks counts + deep links  
5. **Notifications** — unread count + recent items  

### Backend
- Add `title` and `phone` on `accounts.User` (+ migration).
- Extend `GET /api/auth/me/` to return `title`, `phone`, `is_active`, `role`.
- `PATCH /api/auth/me/` — self update of `first_name`, `last_name`, `email`, `title`, `phone` only (not role / `is_active`).
- `POST /api/auth/change-password/` — `{ current_password, new_password }`.
- `GET /api/auth/me/summary/` — personal counts (open leads, open opps, open tasks, unread notifications).
- Tests for self-update restrictions and password change.

### Frontend
- New page: `frontend/src/app/(app)/profile/page.tsx` with the five sections above.
- AppShell: name/role badge links to `/profile`.
- Extend `User` type with `title`, `phone`, optional `is_active`.

### Done when
- Any role can open `/profile`, edit identity, change password, see personal workspace + notifications.
- Users cannot change their own role from the self-panel.

---

## Phase 3 — Team user & role management API ✅

**Outcome:** Sales Managers can create/edit/deactivate users and assign roles via API (foundation for Admin → Team).

### Backend
- `AdminUserSerializer` + manager-only `UserViewSet` at `/api/auth/users/`:
  - `GET` list (active + inactive)
  - `POST` create (username, email, password, role, names, title, phone)
  - `GET` / `PATCH` detail (role, profile, `is_active`, optional password reset)
- Safety rules:
  - Cannot deactivate or demote self
  - Cannot deactivate/demote the last active Sales Manager
- Keep `GET /api/auth/team/` for filter dropdowns (active users only).
- Tests for `IsManager`, CRUD, and safety rules.

### Done when
- Non-managers receive 403 on `/api/auth/users/`.
- Managers can fully administer team membership and roles via API.

---

## Phase 4 — Admin hub UI (`/admin`) ✅

**Outcome:** One precise manager console consolidating team admin + existing manager tools.

### Frontend
- New page: `frontend/src/app/(app)/admin/page.tsx` (manager-only; others redirect to `/dashboard`).
- Nav: rename Settings → **Admin**, href `/admin` (`managerOnly`).
- `/settings` redirects to `/admin`.
- Tabs (one job each):
  1. **Team** — user table, create/edit, role assign, activate/deactivate, set password  
  2. **Routing** — lead routing rule toggles (from current Settings)  
  3. **Operations** — reset demo, stale scan, warm cache, advance sequences, forecast CSV export  
  4. **Jobs** — recent job runs + link to `/jobs`  

### Cleanup
- Forecast: remove duplicate ops (`stale-scan`, `warm-cache`, `reset-demo`); keep Export CSV.
- Sequences: keep “Advance due steps” for workflow context; also available under Admin → Operations.

### Done when
- Managers run team admin + routing + ops + job glance from `/admin` alone.
- Non-managers never see Admin in nav and cannot stay on `/admin`.

---

## Phase 5 — Hardening & polish ✅

**Outcome:** Safe, consistent, demo-ready management surfaces.

### Work
- End-to-end pass: login demos → Profile → Admin Team → Routing → Operations → Jobs.
- Confirm professional labels in all remaining surfaces (leads/pipeline owner filters, empty states, README walkthrough if touched).
- Edge cases: last manager protection, self-demotion blocked, blank password ignored on PATCH, inactive users hidden from `/api/auth/team/` but visible in Admin Team.
- Light UX polish: inline API errors, busy states, confirm dialogs for destructive ops (reset demo, deactivate user).

### Done when
- Demo walkthrough works for Sales Development, Account Executive, and Sales Manager.
- No raw role codes as primary UI labels; Admin and Profile feel like one coherent management system.

---

## Out of scope

- New `ADMIN` role above Sales Manager  
- Full permission-matrix RBAC  
- Customer-facing portal  
- Territories, audit log UI, Beat schedule editor (future)

## Key files

| Area | Paths |
| ---- | ----- |
| Roles / users | `backend/apps/accounts/models.py`, `serializers.py`, `views.py`, `urls.py`, `tests.py`, `test_profile.py` |
| Admin UI | `frontend/src/app/(app)/admin/page.tsx`, `settings/page.tsx` (redirect), `AppShell.tsx` |
| Self-panel | `frontend/src/app/(app)/profile/page.tsx` |
| Shared | `frontend/src/lib/types.ts`, `frontend/src/lib/roles.ts`, login page |
| Cleanup | `frontend/src/app/(app)/forecast/page.tsx` |

## Suggested build order

```text
Phase 1 (labels) → Phase 2 (self-panel) → Phase 3 (users API) → Phase 4 (Admin UI) → Phase 5 (polish)
```

Phases 2 and 3 can overlap after Phase 1 if needed; Phase 4 depends on Phase 3 for the Team tab.
