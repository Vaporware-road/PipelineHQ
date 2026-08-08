"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TmaLoadMore } from "@/components/tma/TmaLoadMore";
import { Badge, Card, Empty } from "@/components/ui";
import { apiListPage } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import { labelFor, LEAD_STATUSES } from "@/lib/tma-constants";
import type { Lead } from "@/lib/types";

const LIST_PATH = "/api/leads/?ordering=-score";

export default function TmaLeadsPage() {
  const { phase } = useTmaAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [count, setCount] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const page = await apiListPage<Lead>(LIST_PATH);
        if (!cancelled) {
          setLeads(page.results);
          setCount(page.count);
          setNext(page.next);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load leads");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const loadMore = useCallback(async () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await apiListPage<Lead>(next);
      setLeads((prev) => [...(prev ?? []), ...page.results]);
      setCount(page.count);
      setNext(page.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [next, loadingMore]);

  if (error && leads === null) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (leads === null) return <Empty>Loading leads…</Empty>;

  return (
    <div className="space-y-4">
      <Link href="/tma" className="text-xs text-[var(--cyan)] hover:underline">
        ← Home
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">Leads</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Tap a lead to update status.</p>
      </div>
      {leads.length === 0 ? (
        <Empty>No leads yet.</Empty>
      ) : (
        <>
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
          <TmaLoadMore
            shown={leads.length}
            total={count}
            next={next}
            loading={loadingMore}
            onLoadMore={loadMore}
          />
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </>
      )}
    </div>
  );
}
