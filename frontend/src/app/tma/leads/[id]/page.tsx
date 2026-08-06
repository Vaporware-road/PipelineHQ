"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Empty, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import { LEAD_STATUSES } from "@/lib/tma-constants";
import type { Lead } from "@/lib/types";

export default function TmaLeadDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { phase } = useTmaAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const row = await api<Lead>(`/api/leads/${id}/`);
        if (!cancelled) {
          setLead(row);
          setStatus(row.status);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load lead");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, id]);

  async function saveStatus() {
    if (!lead || status === lead.status) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await api<Lead>(`/api/leads/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setLead(updated);
      setStatus(updated.status);
      setMessage("Status updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !lead) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!lead) return <Empty>Loading lead…</Empty>;

  return (
    <div className="space-y-4">
      <Link href="/tma/leads" className="text-xs text-[var(--cyan)] hover:underline">
        ← Leads
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          {lead.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {lead.company}
          {lead.title ? ` · ${lead.title}` : ""}
        </p>
      </div>

      <Card className="space-y-2 text-sm">
        <p>
          <span className="text-[var(--muted)]">Email</span> {lead.email || "—"}
        </p>
        <p>
          <span className="text-[var(--muted)]">Source</span> {lead.source}
        </p>
        <p>
          <span className="text-[var(--muted)]">Priority</span> {lead.priority}
        </p>
        <p>
          <span className="text-[var(--muted)]">Score</span>{" "}
          <span className="text-[var(--cyan)]">{lead.score}</span>
        </p>
        {lead.notes ? (
          <p className="border-t border-[var(--line)] pt-2 text-[var(--muted)]">{lead.notes}</p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">Status</p>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
          {LEAD_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Button className="w-full" disabled={busy || status === lead.status} onClick={saveStatus}>
          {busy ? "Saving…" : "Save status"}
        </Button>
        {message ? <p className="text-sm text-[var(--cyan)]">{message}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>
    </div>
  );
}
