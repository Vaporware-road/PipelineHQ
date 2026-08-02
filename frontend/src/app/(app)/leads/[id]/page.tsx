"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CommentThread } from "@/components/CommentThread";
import { CustomFieldsPanel } from "@/components/CustomFieldsPanel";
import { TimelineFeed } from "@/components/TimelineFeed";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";
import type { CrmTask, DuplicateSuspect, Lead, Sequence, SequenceEnrollment, User } from "@/lib/types";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const BUDGET_MIN = 1000;
const BUDGET_MAX = 500000;
const BUDGET_STEP = 1000;

function formatBudget(amount: number) {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k`;
  return `$${amount}`;
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [team, setTeam] = useState<User[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [mergeLoser, setMergeLoser] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [enrollSeq, setEnrollSeq] = useState("");
  const [dupes, setDupes] = useState<DuplicateSuspect[]>([]);

  async function load() {
    try {
      const [l, t, s, e] = await Promise.all([
        api<Lead>(`/api/leads/${params.id}/`),
        apiList<CrmTask>(`/api/tasks/?lead=${params.id}`),
        apiList<Sequence>("/api/sequences/?is_active=true"),
        apiList<SequenceEnrollment>(`/api/sequence-enrollments/?lead=${params.id}`),
      ]);
      setLead(l);
      setTasks(t);
      setSequences(s);
      setEnrollments(e);
      setError("");
      try {
        const res = await api<{ duplicates: DuplicateSuspect[] }>("/api/duplicates/check/", {
          method: "POST",
          body: JSON.stringify({
            entity_type: "lead",
            email: l.email,
            name: l.name,
            company: l.company,
            exclude_id: l.id,
          }),
        });
        setDupes((res.duplicates || []).filter((d) => d.id !== l.id));
      } catch {
        setDupes([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead");
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  useEffect(() => {
    apiList<User>("/api/auth/team/")
      .then(setTeam)
      .catch(() => setTeam([]));
  }, []);

  async function saveField(patch: Partial<Lead> & { owner_id?: number; custom_fields?: Lead["custom_fields"] }) {
    setBusy(true);
    setError("");
    try {
      setLead(await api<Lead>(`/api/leads/${params.id}/`, { method: "PATCH", body: JSON.stringify(patch) }));
      setTimelineKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ opportunity: { id: number } }>(`/api/leads/${params.id}/convert/`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(`/opportunities/${result.opportunity.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setBusy(false);
    }
  }

  async function mergeLeads() {
    if (!mergeLoser.trim() || !lead) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/duplicates/merge/", {
        method: "POST",
        body: JSON.stringify({
          entity_type: "lead",
          winner_id: lead.id,
          loser_id: Number(mergeLoser),
        }),
      });
      setMergeLoser("");
      await load();
      setTimelineKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    setBusy(true);
    try {
      await api("/api/tasks/", {
        method: "POST",
        body: JSON.stringify({ title: taskTitle, lead: Number(params.id) }),
      });
      setTaskTitle("");
      setTasks(await apiList<CrmTask>(`/api/tasks/?lead=${params.id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Task create failed");
    } finally {
      setBusy(false);
    }
  }

  async function enroll() {
    if (!enrollSeq) return;
    setBusy(true);
    try {
      await api("/api/sequence-enrollments/", {
        method: "POST",
        body: JSON.stringify({ sequence: Number(enrollSeq), lead: Number(params.id) }),
      });
      setEnrollSeq("");
      setEnrollments(await apiList<SequenceEnrollment>(`/api/sequence-enrollments/?lead=${params.id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enroll failed");
    } finally {
      setBusy(false);
    }
  }

  if (!lead) {
    return (
      <div>
        <PageHeader title="Lead" subtitle="Loading…" />
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : <Empty>Loading lead…</Empty>}
      </div>
    );
  }

  const budget = lead.budget_amount ?? BUDGET_MIN;
  const canReassign = user?.role === "MANAGER";

  return (
    <div>
      <PageHeader
        title={lead.name}
        subtitle={`${lead.company} · ${lead.email}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/leads" className="text-sm text-[var(--cyan)] hover:underline">
              ← Leads
            </Link>
            {lead.status !== "converted" ? (
              <Button disabled={busy} onClick={convert}>
                Convert
              </Button>
            ) : lead.converted_opportunity ? (
              <Link href={`/opportunities/${lead.converted_opportunity}`} className="text-sm text-[var(--cyan)] hover:underline">
                Open deal →
              </Link>
            ) : null}
          </div>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Details</h2>
          <div className="mt-3 space-y-3">
            <Field label="Name">
              <Input
                defaultValue={lead.name}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== lead.name) saveField({ name: e.target.value });
                }}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                defaultValue={lead.email}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== lead.email) saveField({ email: e.target.value });
                }}
              />
            </Field>
            <Field label="Company">
              <Input
                defaultValue={lead.company}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== lead.company) saveField({ company: e.target.value });
                }}
              />
            </Field>
            <Field label="Title">
              <Input
                defaultValue={lead.title}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== lead.title) saveField({ title: e.target.value });
                }}
              />
            </Field>
            <Field label="Status">
              <Select
                value={lead.status}
                disabled={busy || lead.status === "converted"}
                onChange={(e) => saveField({ status: e.target.value })}
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="disqualified">Disqualified</option>
                <option value="converted">Converted</option>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={lead.source} disabled={busy} onChange={(e) => saveField({ source: e.target.value })}>
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="outbound">Outbound</option>
                <option value="event">Event</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Owner">
              <Select
                value={lead.owner.id}
                disabled={busy || !canReassign}
                onChange={(e) => saveField({ owner_id: Number(e.target.value) })}
              >
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} ({roleLabel(u.role)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <div className="flex flex-wrap gap-1">
                {PRIORITIES.map((p) => (
                  <Button
                    key={p}
                    variant={lead.priority === p ? "primary" : "ghost"}
                    disabled={busy}
                    onClick={() => saveField({ priority: p })}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </Field>
            <Field label={`Budget ${formatBudget(budget)}`}>
              <input
                type="range"
                min={BUDGET_MIN}
                max={BUDGET_MAX}
                step={BUDGET_STEP}
                value={budget}
                disabled={busy}
                className="w-full accent-[var(--cyan)]"
                onChange={(e) => setLead({ ...lead, budget_amount: Number(e.target.value) })}
                onMouseUp={(e) => saveField({ budget_amount: Number((e.target as HTMLInputElement).value) })}
                onTouchEnd={(e) => saveField({ budget_amount: Number((e.target as HTMLInputElement).value) })}
              />
              <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
                <span>$1k</span>
                <span>$500k</span>
              </div>
            </Field>
            <Field label="Notes">
              <Textarea
                rows={4}
                defaultValue={lead.notes}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== lead.notes) saveField({ notes: e.target.value });
                }}
              />
            </Field>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              <Badge>{lead.status}</Badge>
              <Badge tone="ok">Score {lead.score}</Badge>
              <Badge>{lead.priority}</Badge>
            </div>
            {lead.score_reasons?.length ? (
              <ul className="space-y-1 text-xs text-[var(--muted)]">
                {lead.score_reasons.map((r, i) => (
                  <li key={`${r.factor}-${i}`}>
                    {r.factor}: {r.detail} (+{r.points})
                  </li>
                ))}
              </ul>
            ) : null}
            {lead.converted_account ? (
              <Link href={`/accounts/${lead.converted_account}`} className="block text-sm text-[var(--cyan)] hover:underline">
                Converted account →
              </Link>
            ) : null}
            {lead.converted_contact ? (
              <Link href={`/contacts/${lead.converted_contact}`} className="block text-sm text-[var(--cyan)] hover:underline">
                Converted contact →
              </Link>
            ) : null}
            <CustomFieldsPanel
              entity="lead"
              values={lead.custom_fields || {}}
              disabled={busy}
              onSave={(patch) => saveField({ custom_fields: { ...(lead.custom_fields || {}), ...patch } })}
            />
          </div>

          {user?.role === "MANAGER" && lead.status !== "converted" ? (
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">Merge duplicate</h3>
              <div className="mt-2 flex gap-2">
                <Input placeholder="Loser lead ID" value={mergeLoser} onChange={(e) => setMergeLoser(e.target.value)} />
                <Button disabled={busy || !mergeLoser.trim()} onClick={mergeLeads}>
                  Merge
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Timeline</h2>
            <div className="mt-3">
              <TimelineFeed scope={{ lead: Number(params.id) }} refreshKey={timelineKey} />
            </div>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Tasks</h2>
            <div className="mt-3 flex gap-2">
              <Input placeholder="New task title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              <Button disabled={busy || !taskTitle.trim()} onClick={addTask}>
                Add
              </Button>
            </div>
            <ul className="mt-3 space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/tasks/${t.id}`} className="text-[var(--cyan)] hover:underline">
                    {t.title}
                  </Link>
                  <Badge tone={t.completed ? "ok" : "neutral"}>{t.status}</Badge>
                </li>
              ))}
              {tasks.length === 0 ? <Empty>No tasks on this lead.</Empty> : null}
            </ul>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Sequence enroll</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Email cadence for this lead (requires Celery to send).</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Select value={enrollSeq} onChange={(e) => setEnrollSeq(e.target.value)}>
                <option value="">Select sequence…</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.step_count} steps)
                  </option>
                ))}
              </Select>
              <Button disabled={busy || !enrollSeq} onClick={enroll}>
                Enroll
              </Button>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {enrollments.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>
                    {e.sequence_name} · step {e.current_step_order}
                  </span>
                  <Badge>{e.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Comments</h2>
            <div className="mt-3">
              <CommentThread endpoint={`/api/leads/${params.id}/comments/`} refreshKey={timelineKey} />
            </div>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Possible duplicates</h2>
            <ul className="mt-3 space-y-2">
              {dupes.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={d.href} className="text-[var(--cyan)] hover:underline">
                    {d.label}
                  </Link>
                  <span className="text-xs text-[var(--muted)]">{d.reasons?.join(" · ")}</span>
                </li>
              ))}
              {dupes.length === 0 ? <Empty>No duplicate suspects.</Empty> : null}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
