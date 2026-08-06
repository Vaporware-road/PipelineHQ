"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Empty, Input, Money, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import { OPP_STAGES } from "@/lib/tma-constants";
import type { Opportunity } from "@/lib/types";

export default function TmaOpportunityDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { phase } = useTmaAuth();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [stage, setStage] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const row = await api<Opportunity>(`/api/opportunities/${id}/`);
        if (!cancelled) {
          setOpp(row);
          setStage(row.stage);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load deal");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, id]);

  const needsReason = stage === "closed_won" || stage === "closed_lost";

  async function saveStage() {
    if (!opp || stage === opp.stage) return;
    if (needsReason && !closeReason.trim()) {
      setError(stage === "closed_won" ? "Win reason is required." : "Loss reason is required.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const patch: Record<string, string> = { stage };
      if (stage === "closed_won") patch.win_reason = closeReason.trim();
      if (stage === "closed_lost") patch.loss_reason = closeReason.trim();
      const updated = await api<Opportunity>(`/api/opportunities/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setOpp(updated);
      setStage(updated.stage);
      setCloseReason("");
      setMessage("Stage updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !opp) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!opp) return <Empty>Loading deal…</Empty>;

  return (
    <div className="space-y-4">
      <Link href="/tma/pipeline" className="text-xs text-[var(--cyan)] hover:underline">
        ← Pipeline
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          {opp.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{opp.account_name}</p>
      </div>

      <Card className="space-y-2 text-sm">
        <p>
          <span className="text-[var(--muted)]">Amount</span> <Money value={opp.amount} />
        </p>
        <p>
          <span className="text-[var(--muted)]">Close date</span> {opp.close_date}
        </p>
        <p>
          <span className="text-[var(--muted)]">Next step</span> {opp.next_step || "—"}
        </p>
        <p>
          <span className="text-[var(--muted)]">Health</span> {opp.health}
        </p>
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">Stage</p>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} disabled={busy}>
          {OPP_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        {needsReason ? (
          <Input
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder={stage === "closed_won" ? "Win reason" : "Loss reason"}
            disabled={busy}
          />
        ) : null}
        <Button className="w-full" disabled={busy || stage === opp.stage} onClick={saveStage}>
          {busy ? "Saving…" : "Save stage"}
        </Button>
        {message ? <p className="text-sm text-[var(--cyan)]">{message}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>
    </div>
  );
}
