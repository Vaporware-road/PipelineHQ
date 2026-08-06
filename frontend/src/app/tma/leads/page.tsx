"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, Empty } from "@/components/ui";
import { apiList } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import { labelFor, LEAD_STATUSES } from "@/lib/tma-constants";
import type { Lead } from "@/lib/types";

export default function TmaLeadsPage() {
  const { phase } = useTmaAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiList<Lead>("/api/leads/?ordering=-score");
        if (!cancelled) setLeads(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load leads");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (leads === null) return <Empty>Loading leads…</Empty>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">Leads</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Tap a lead to update status.</p>
      </div>
      {leads.length === 0 ? (
        <Empty>No leads yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link href={`/tma/leads/${lead.id}`}>
                <Card className="transition hover:border-[var(--accent)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--ink)]">{lead.name}</p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {lead.company || lead.email}
                      </p>
                    </div>
                    <Badge>{labelFor(LEAD_STATUSES, lead.status)}</Badge>
                  </div>
                  <p className="mt-2 text-xs tabular-nums text-[var(--cyan)]">score {lead.score}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
