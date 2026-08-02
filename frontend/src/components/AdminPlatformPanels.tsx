"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Input, Select } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type {
  AuditEvent,
  CustomFieldDefinition,
  LeadRoutingRule,
  Territory,
  User,
} from "@/lib/types";

const ENTITIES: CustomFieldDefinition["entity"][] = ["lead", "account", "contact", "opportunity"];
const FIELD_TYPES: CustomFieldDefinition["field_type"][] = ["text", "number", "bool", "select", "date"];

export function AdminFieldsPanel({
  busy,
  setBusy,
  setError,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string) => void;
}) {
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([]);
  const [form, setForm] = useState({
    entity: "lead" as CustomFieldDefinition["entity"],
    key: "",
    label: "",
    field_type: "text" as CustomFieldDefinition["field_type"],
    options: "",
    required: false,
  });

  async function load() {
    setDefs(await apiList<CustomFieldDefinition>("/api/custom-fields/"));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed to load fields"));
  }, [setError]);

  async function createField(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/custom-fields/", {
        method: "POST",
        body: JSON.stringify({
          entity: form.entity,
          key: form.key,
          label: form.label,
          field_type: form.field_type,
          options:
            form.field_type === "select"
              ? form.options.split(",").map((s) => s.trim()).filter(Boolean)
              : [],
          required: form.required,
          is_active: true,
        }),
      });
      setForm({ entity: "lead", key: "", label: "", field_type: "text", options: "", required: false });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(def: CustomFieldDefinition) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/custom-fields/${def.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !def.is_active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Custom fields</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Define EAV fields for leads, accounts, contacts, and opportunities. Active fields appear on detail forms.
        </p>
        <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={createField}>
          <Select
            value={form.entity}
            onChange={(e) => setForm({ ...form, entity: e.target.value as CustomFieldDefinition["entity"] })}
          >
            {ENTITIES.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </Select>
          <Select
            value={form.field_type}
            onChange={(e) =>
              setForm({ ...form, field_type: e.target.value as CustomFieldDefinition["field_type"] })
            }
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Input
            placeholder="key (slug)"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            required
          />
          <Input
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            required
          />
          {form.field_type === "select" ? (
            <Input
              className="sm:col-span-2"
              placeholder="Options (comma-separated)"
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
              required
            />
          ) : null}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
            />
            Required
          </label>
          <Button type="submit" disabled={busy} className="sm:col-span-2 sm:w-fit">
            Add field
          </Button>
        </form>
      </Card>
      <Card className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Key</th>
              <th>Label</th>
              <th>Type</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {defs.map((def) => (
              <tr key={def.id}>
                <td>{def.entity}</td>
                <td className="font-mono text-xs">{def.key}</td>
                <td>{def.label}</td>
                <td>{def.field_type}</td>
                <td>
                  <Badge tone={def.is_active ? "ok" : "neutral"}>
                    {def.is_active ? "active" : "inactive"}
                  </Badge>
                </td>
                <td>
                  <Button variant="ghost" disabled={busy} onClick={() => toggleActive(def)}>
                    {def.is_active ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {defs.length === 0 ? <Empty>No custom fields yet.</Empty> : null}
      </Card>
    </div>
  );
}

export function AdminTerritoriesPanel({
  busy,
  setBusy,
  setError,
}: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string) => void;
}) {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rules, setRules] = useState<LeadRoutingRule[]>([]);
  const [form, setForm] = useState({ name: "", region: "", industry: "", member_ids: [] as number[] });

  async function load() {
    const [t, u, r] = await Promise.all([
      apiList<Territory>("/api/territories/"),
      apiList<User>("/api/auth/users/"),
      apiList<LeadRoutingRule>("/api/routing-rules/"),
    ]);
    setTerritories(t);
    setUsers(u.filter((x) => x.is_active !== false));
    setRules(r);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed to load territories"));
  }, [setError]);

  async function createTerritory(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/territories/", {
        method: "POST",
        body: JSON.stringify({ ...form, is_active: true }),
      });
      setForm({ name: "", region: "", industry: "", member_ids: [] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function setRuleTerritory(rule: LeadRoutingRule, territoryId: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/routing-rules/${rule.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ territory_id: territoryId ? Number(territoryId) : null }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Routing update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Territories</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Assign reps and accounts to regions. Routing rules can prefer territory SDRs.
        </p>
        <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={createTerritory}>
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            placeholder="Region"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
          />
          <Input
            placeholder="Industry hint"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
          />
          <Select
            multiple
            value={form.member_ids.map(String)}
            onChange={(e) =>
              setForm({
                ...form,
                member_ids: Array.from(e.target.selectedOptions).map((o) => Number(o.value)),
              })
            }
            className="min-h-[6rem]"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} · {u.role}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={busy} className="sm:col-span-2 sm:w-fit">
            Add territory
          </Button>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Region</th>
              <th>Industry</th>
              <th>Members</th>
              <th>Accounts</th>
            </tr>
          </thead>
          <tbody>
            {territories.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.region || "—"}</td>
                <td>{t.industry || "—"}</td>
                <td className="text-xs">{t.members.map((m) => m.username).join(", ") || "—"}</td>
                <td>{t.account_count ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {territories.length === 0 ? <Empty>No territories yet.</Empty> : null}
      </Card>

      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Routing → territory</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Optionally scope round-robin to SDRs in a territory.
        </p>
        <div className="mt-4 space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{rule.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {rule.territory_name ? `Territory: ${rule.territory_name}` : "All SDRs"}
                </p>
              </div>
              <Select
                value={rule.territory ? String(rule.territory) : ""}
                disabled={busy}
                onChange={(e) => setRuleTerritory(rule, e.target.value)}
              >
                <option value="">All SDRs</option>
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function AdminAuditPanel({ setError }: { setError: (v: string) => void }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filters, setFilters] = useState({ entity_type: "", action: "", from: "", to: "" });

  async function load(next = filters) {
    const params = new URLSearchParams();
    if (next.entity_type) params.set("entity_type", next.entity_type);
    if (next.action) params.set("action", next.action);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    const qs = params.toString();
    setEvents(await apiList<AuditEvent>(`/api/audit-events/${qs ? `?${qs}` : ""}`));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Failed to load audit"));
    // initial only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="overflow-x-auto">
      <h2 className="font-[family-name:var(--font-display)] text-lg">Audit log</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Append-only history of create/update/delete, stage, owner, and status changes. Read-only.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Select
          value={filters.entity_type}
          onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
        >
          <option value="">All entities</option>
          {ENTITIES.map((entity) => (
            <option key={entity} value={entity}>
              {entity}
            </option>
          ))}
        </Select>
        <Select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>
          <option value="">All actions</option>
          {["create", "update", "delete", "stage", "owner", "status"].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
        <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        <Button
          variant="ghost"
          onClick={() => load().catch((e) => setError(e instanceof Error ? e.message : "Filter failed"))}
        >
          Apply
        </Button>
      </div>
      <table className="mt-4">
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>Object</th>
            <th>Actor</th>
            <th>Changes</th>
          </tr>
        </thead>
        <tbody>
          {events.slice(0, 50).map((ev) => (
            <tr key={ev.id}>
              <td className="whitespace-nowrap text-xs">{formatDateTime(ev.occurred_at)}</td>
              <td>
                <Badge>{ev.action}</Badge>
              </td>
              <td className="text-sm">
                {ev.entity_type} #{ev.entity_id}
                {ev.entity_label ? (
                  <span className="block text-xs text-[var(--muted)]">{ev.entity_label}</span>
                ) : null}
              </td>
              <td className="text-sm">{ev.actor?.username || "—"}</td>
              <td className="max-w-xs font-mono text-xs text-[var(--muted)]">
                {Object.keys(ev.changes || {}).length
                  ? Object.keys(ev.changes).slice(0, 4).join(", ")
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {events.length === 0 ? <Empty>No audit events match.</Empty> : null}
    </Card>
  );
}
