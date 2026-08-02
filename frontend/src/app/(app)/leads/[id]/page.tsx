"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TimelineFeed } from "@/components/TimelineFeed";
import { CustomFieldsPanel } from "@/components/CustomFieldsPanel";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Lead } from "@/lib/types";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [mergeLoser, setMergeLoser] = useState("");

  async function load() {
    try {
      setLead(await api<Lead>(`/api/leads/${params.id}/`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lead");
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function saveField(patch: Partial<Lead>) {
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

  if (!lead) {
    return (
      <div>
        <PageHeader title="Lead" subtitle="Loading…" />
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : <Empty>Loading lead…</Empty>}
      </div>
    );
  }

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
              <span>Owner: {lead.owner.username}</span>
            </div>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const res = await api<{ lead: Lead }>(`/api/leads/${lead.id}/ai-score-overlay/`, {
                    method: "POST",
                    body: JSON.stringify({}),
                  });
                  setLead(res.lead);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "AI score failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Refine score (AI overlay)
            </Button>
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

        <Card className="lg:col-span-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Timeline</h2>
          <div className="mt-3">
            <TimelineFeed scope={{ lead: Number(params.id) }} refreshKey={timelineKey} />
          </div>
        </Card>
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
