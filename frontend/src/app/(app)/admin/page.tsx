"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Empty, Input, PageHeader, Select } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS, roleLabel } from "@/lib/roles";
import type { JobRun, LeadRoutingRule, Role, User } from "@/lib/types";

type Tab = "team" | "routing" | "operations" | "jobs";

type UserForm = {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: Role;
  title: string;
  phone: string;
  is_active: boolean;
};

const EMPTY_FORM: UserForm = {
  username: "",
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  role: "AE",
  title: "",
  phone: "",
  is_active: true,
};

const TABS: { id: Tab; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "routing", label: "Routing" },
  { id: "operations", label: "Operations" },
  { id: "jobs", label: "Jobs" },
];

function displayName(u: Pick<User, "first_name" | "last_name" | "username">) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
  return name || u.username;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("team");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [editor, setEditor] = useState<"create" | User | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

  const [rules, setRules] = useState<LeadRoutingRule[]>([]);
  const [job, setJob] = useState<JobRun | null>(null);
  const [jobs, setJobs] = useState<JobRun[]>([]);

  const editingSelf = typeof editor === "object" && editor !== null && editor.id === user?.id;

  useEffect(() => {
    if (!loading && user && user.role !== "MANAGER") {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  async function loadUsers() {
    setUsers(await apiList<User>("/api/auth/users/"));
  }

  async function loadRules() {
    setRules(await apiList<LeadRoutingRule>("/api/routing-rules/"));
  }

  async function loadJobs() {
    setJobs(await apiList<JobRun>("/api/jobs/"));
  }

  useEffect(() => {
    if (user?.role !== "MANAGER") return;
    let cancelled = false;
    setError("");
    setTabLoading(true);
    (async () => {
      try {
        if (tab === "team") await loadUsers();
        else if (tab === "routing") await loadRules();
        else if (tab === "jobs") await loadJobs();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.role, tab]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditor("create");
    setFormError("");
    setError("");
  }

  function openEdit(u: User) {
    setForm({
      username: u.username,
      email: u.email,
      password: "",
      first_name: u.first_name,
      last_name: u.last_name,
      role: u.role,
      title: u.title || "",
      phone: u.phone || "",
      is_active: u.is_active !== false,
    });
    setEditor(u);
    setFormError("");
    setError("");
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    if (editor && editor !== "create" && editor.is_active !== false && !form.is_active) {
      if (!window.confirm(`Deactivate ${displayName(form)}? They will lose access immediately.`)) {
        return;
      }
    }
    setBusy(true);
    setFormError("");
    setError("");
    try {
      if (editor === "create") {
        await api<User>("/api/auth/users/", {
          method: "POST",
          body: JSON.stringify({
            username: form.username,
            email: form.email,
            password: form.password,
            first_name: form.first_name,
            last_name: form.last_name,
            role: form.role,
            title: form.title,
            phone: form.phone,
            is_active: form.is_active,
          }),
        });
      } else if (editor) {
        const body: Record<string, unknown> = {
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          title: form.title,
          phone: form.phone,
          is_active: form.is_active,
        };
        if (form.password.trim()) body.password = form.password;
        await api<User>(`/api/auth/users/${editor.id}/`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      setEditor(null);
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: User) {
    const next = u.is_active === false;
    const action = next ? "Activate" : "Deactivate";
    const detail = next
      ? `${action} ${displayName(u)}?`
      : `Deactivate ${displayName(u)}? They will lose access immediately.`;
    if (!window.confirm(detail)) return;
    setBusy(true);
    setError("");
    try {
      await api<User>(`/api/auth/users/${u.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRule(rule: LeadRoutingRule) {
    setBusy(true);
    setError("");
    try {
      const updated = await api<LeadRoutingRule>(`/api/routing-rules/${rule.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function runOps(action: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setError("");
    try {
      setJob(await api<JobRun>(`/api/ops/${action}/`, { method: "POST" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ops action failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportForecast() {
    setBusy(true);
    setError("");
    try {
      setJob(await api<JobRun>("/api/forecast/", { method: "POST" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user || user.role !== "MANAGER") {
    return <Empty>Sales Manager access only…</Empty>;
  }

  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="Team membership, lead routing, and manager operations."
      />

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-[var(--line)] pb-3">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm tracking-wide transition ${
                active
                  ? "bg-[var(--accent-soft)] text-[var(--accent-ink)] ring-1 ring-[rgba(255,43,214,0.35)]"
                  : "text-[var(--muted)] hover:bg-[rgba(0,229,255,0.06)] hover:text-[var(--ink)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      {tab === "team" ? (
        <Card className="overflow-x-auto">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Team</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Create users, assign roles, and activate or deactivate accounts. Inactive users stay
                listed here but are hidden from owner filters.
              </p>
            </div>
            <Button onClick={openCreate} disabled={busy}>
              Add user
            </Button>
          </div>
          {tabLoading ? (
            <Empty>Loading team…</Empty>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.is_active === false ? "opacity-60" : undefined}>
                      <td>
                        <div>{displayName(u)}</div>
                        <div className="text-xs text-[var(--muted)]">{u.email}</div>
                      </td>
                      <td className="font-mono text-xs">{u.username}</td>
                      <td>{roleLabel(u.role)}</td>
                      <td>{u.title || "—"}</td>
                      <td>
                        <Badge tone={u.is_active === false ? "warn" : "ok"}>
                          {u.is_active === false ? "inactive" : "active"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" disabled={busy} onClick={() => openEdit(u)}>
                            Edit
                          </Button>
                          <Button
                            variant={u.is_active === false ? "primary" : "danger"}
                            disabled={busy || u.id === user.id}
                            onClick={() => toggleActive(u)}
                            title={u.id === user.id ? "You cannot deactivate your own account" : undefined}
                          >
                            {u.is_active === false ? "Activate" : "Deactivate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 ? <Empty>No users yet.</Empty> : null}
            </>
          )}
        </Card>
      ) : null}

      {tab === "routing" ? (
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Lead routing</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            When enabled, new leads (without an explicit owner) are round-robined to Sales Development and the
            assignee gets an in-app notification.
          </p>
          {tabLoading ? (
            <Empty>Loading routing rules…</Empty>
          ) : (
            <div className="mt-4 space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col gap-3 rounded-lg border border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{rule.name}</p>
                      <Badge tone={rule.enabled ? "ok" : "neutral"}>
                        {rule.enabled ? "enabled" : "disabled"}
                      </Badge>
                      <Badge>{rule.strategy.replace("_", " ")}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Source filter: {rule.source || "all sources"}
                      {rule.last_assignee
                        ? ` · last assignee: ${rule.last_assignee.username}`
                        : " · no assignments yet"}
                    </p>
                  </div>
                  <Button disabled={busy} onClick={() => toggleRule(rule)}>
                    {rule.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
              {rules.length === 0 ? <Empty>No routing rules.</Empty> : null}
            </div>
          )}
        </Card>
      ) : null}

      {tab === "operations" ? (
        <div className="space-y-4">
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Operations</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Manager jobs for demo resets, cache, stale deals, sequences, and forecast export. Requires a Celery
              worker — track progress on{" "}
              <Link href="/jobs" className="underline">
                Jobs
              </Link>
              .
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  runOps(
                    "reset-demo",
                    "Reset all demo CRM data and reseed? This cannot be undone.",
                  )
                }
              >
                Reset demo data
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => runOps("stale-scan")}>
                Run stale scan
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => runOps("warm-cache")}>
                Warm cache
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => runOps("advance-sequences")}>
                Advance due steps
              </Button>
              <Button disabled={busy} onClick={exportForecast}>
                Export forecast CSV
              </Button>
            </div>
            {busy ? <p className="mt-2 text-xs text-[var(--muted)]">Working…</p> : null}
            {job ? (
              <p className="mt-3 text-sm">
                Job #{job.id} · {job.type} · <strong>{job.status}</strong>
                {job.message ? ` — ${job.message}` : null}
                {job.result_file_url ? (
                  <>
                    {" "}
                    ·{" "}
                    <a className="text-[var(--accent)] underline" href={job.result_file_url}>
                      Download
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "jobs" ? (
        <Card className="overflow-x-auto">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Recent jobs</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Glance at recent Celery runs. Full history and auto-refresh live on{" "}
                <Link href="/jobs" className="underline">
                  Jobs
                </Link>
                .
              </p>
            </div>
            <Button
              variant="ghost"
              disabled={busy || tabLoading}
              onClick={() => {
                setBusy(true);
                loadJobs()
                  .catch((e) => setError(e instanceof Error ? e.message : "Refresh failed"))
                  .finally(() => setBusy(false));
              }}
            >
              {busy || tabLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          {tabLoading ? (
            <Empty>Loading jobs…</Empty>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Message</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 10).map((j) => (
                    <tr key={j.id}>
                      <td>{j.id}</td>
                      <td>{j.type}</td>
                      <td>
                        <Badge
                          tone={
                            j.status === "success" ? "ok" : j.status === "failed" ? "warn" : "neutral"
                          }
                        >
                          {j.status}
                        </Badge>
                      </td>
                      <td className="max-w-xs">{j.message || "—"}</td>
                      <td className="text-xs">{formatDateTime(j.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {jobs.length === 0 ? <Empty>No jobs yet.</Empty> : null}
              {jobs.length > 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  <Link href="/jobs" className="underline">
                    Open full Jobs page →
                  </Link>
                </p>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {editor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,6,20,0.78)] px-4 backdrop-blur-md"
          onClick={() => !busy && setEditor(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_0_0_1px_rgba(0,229,255,0.08),0_0_40px_rgba(255,43,214,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              {editor === "create" ? "Add user" : `Edit ${displayName(editor)}`}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {editor === "create"
                ? "Create a teammate and assign a role."
                : editingSelf
                  ? "Update your profile fields. Role and active status are locked for your own account."
                  : "Update profile, role, password, or active status. Leave password blank to keep the current one."}
            </p>
            <form className="mt-4 grid gap-3" onSubmit={saveUser}>
              {formError ? <p className="text-sm text-[var(--danger)]">{formError}</p> : null}
              {editor === "create" ? (
                <Input
                  placeholder="Username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  autoFocus
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Username: <span className="font-mono text-[var(--ink)]">{form.username}</span>
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="First name"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
                <Input
                  placeholder="Last name"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
              <Input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Job title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
                <Input
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">Role</span>
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  required
                  disabled={editingSelf}
                  title={editingSelf ? "You cannot change your own role" : undefined}
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </label>
              <Input
                type="password"
                placeholder={editor === "create" ? "Password" : "New password (optional)"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={editor === "create"}
                autoComplete="new-password"
              />
              {editor !== "create" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    disabled={editingSelf}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active account
                  {editingSelf ? (
                    <span className="text-xs text-[var(--muted)]">(locked for your account)</span>
                  ) : null}
                </label>
              ) : null}
              <div className="mt-1 flex justify-end gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditor(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : editor === "create" ? "Create" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
