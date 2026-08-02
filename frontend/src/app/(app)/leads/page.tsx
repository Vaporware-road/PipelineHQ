"use client";

import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/DateTimeFields";
import { Badge, Button, Card, Empty, Input, PageHeader, Select } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import type { Lead, User } from "@/lib/types";

type LeadFilters = {
  status: string;
  source: string;
  owner: string;
  created_from: string;
  created_to: string;
  q: string;
};

const EMPTY_FILTERS: LeadFilters = {
  status: "",
  source: "",
  owner: "",
  created_from: "",
  created_to: "",
  q: "",
};

function buildQuery(filters: LeadFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.created_from) params.set("created_from", filters.created_from);
  if (filters.created_to) params.set("created_to", filters.created_to);
  if (filters.q.trim()) params.set("search", filters.q.trim());
  params.set("ordering", "-score");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [team, setTeam] = useState<User[]>([]);
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<LeadFilters>(EMPTY_FILTERS);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    title: "",
    source: "website",
  });
  const [csvText, setCsvText] = useState(
    "name,email,company,title,source\nAda Lovelace,ada@analytical.engine,Analytical Engine,Mathematician,website",
  );

  const query = useMemo(() => buildQuery(applied), [applied]);

  async function load() {
    try {
      setLeads(await apiList<Lead>(`/api/leads/${query}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads");
    }
  }

  useEffect(() => {
    apiList<User>("/api/auth/team/")
      .then(setTeam)
      .catch(() => setTeam([]));
  }, []);

  useEffect(() => {
    load();
  }, [query]);

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/leads/", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", email: "", company: "", title: "", source: "website" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function convertLead(id: number) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/leads/${id}/convert/`, {
        method: "POST",
        body: JSON.stringify({ amount: 25000 }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Convert failed");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    setBusy(true);
    setError("");
    try {
      await api("/api/leads/import-csv/", {
        method: "POST",
        body: JSON.stringify({ csv_text: csvText }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleStatus(value: string) {
    const current = filters.status ? filters.status.split(",").filter(Boolean) : [];
    const next = current.includes(value) ? current.filter((s) => s !== value) : [...current, value];
    setFilters({ ...filters, status: next.join(",") });
  }

  const activeStatuses = new Set(filters.status ? filters.status.split(",") : []);

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Sales Development workspace — create, qualify, convert. CSV import runs on Celery."
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Filters</h2>
          <Button
            variant="ghost"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setApplied(EMPTY_FILTERS);
            }}
          >
            Clear
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["new", "contacted", "qualified", "disqualified", "converted"] as const).map((status) => (
            <Button
              key={status}
              variant={activeStatuses.has(status) ? "primary" : "ghost"}
              onClick={() => toggleStatus(status)}
            >
              {status}
            </Button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
            <option value="">All sources</option>
            <option value="website">Website</option>
            <option value="referral">Referral</option>
            <option value="outbound">Outbound</option>
            <option value="event">Event</option>
            <option value="other">Other</option>
          </Select>
          <Select value={filters.owner} onChange={(e) => setFilters({ ...filters, owner: e.target.value })}>
            <option value="">All owners</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({roleLabel(u.role)})
              </option>
            ))}
          </Select>
          <DatePicker
            mode="date"
            placeholder="Created from"
            value={filters.created_from}
            onChange={(created_from) => setFilters({ ...filters, created_from })}
          />
          <DatePicker
            mode="date"
            placeholder="Created to"
            value={filters.created_to}
            onChange={(created_to) => setFilters({ ...filters, created_to })}
          />
          <Input
            placeholder="Search name/email/company"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <div className="mt-3">
          <Button onClick={() => setApplied({ ...filters })}>Apply filters</Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">New lead</h2>
          <form className="mt-3 grid gap-2" onSubmit={createLead}>
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required />
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="outbound">Outbound</option>
              <option value="event">Event</option>
              <option value="other">Other</option>
            </Select>
            <Button type="submit" disabled={busy}>
              Create lead
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Async CSV import</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Returns HTTP 202 + JobRun; worker creates leads.</p>
          <textarea
            className="mt-3 h-40 w-full rounded-md border border-[var(--line)] p-2 font-mono text-xs"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <Button className="mt-2" disabled={busy} onClick={importCsv}>
            Queue import
          </Button>
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Score</th>
              <th>Status</th>
              <th>Source</th>
              <th>Owner</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-xs text-[var(--muted)]">{lead.email}</div>
                </td>
                <td>{lead.company}</td>
                <td>
                  <span
                    className="font-medium tabular-nums"
                    title={(lead.score_reasons || [])
                      .map((r) => `${r.factor}: +${r.points} (${r.detail})`)
                      .join("\n")}
                  >
                    {lead.score ?? 0}
                  </span>
                </td>
                <td>
                  <Badge tone={lead.status === "converted" ? "ok" : "neutral"}>{lead.status}</Badge>
                </td>
                <td>{lead.source}</td>
                <td className="text-sm text-[var(--muted)]">{lead.owner?.username}</td>
                <td>
                  {lead.status !== "converted" ? (
                    <Button variant="ghost" disabled={busy} onClick={() => convertLead(lead.id)}>
                      Convert
                    </Button>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">Converted</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 ? <Empty>No leads match these filters.</Empty> : null}
      </Card>
    </div>
  );
}
