"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TmaLoadMore } from "@/components/tma/TmaLoadMore";
import { Badge, Card, Empty, Money } from "@/components/ui";
import { apiListPage } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import { labelFor, OPP_STAGES } from "@/lib/tma-constants";
import type { Opportunity } from "@/lib/types";

const OPEN_STAGES = OPP_STAGES.filter(
  (s) => s.value !== "closed_won" && s.value !== "closed_lost",
);

const OPEN_STAGE_VALUES = OPEN_STAGES.map((s) => s.value).join(",");
const LIST_PATH = `/api/opportunities/?ordering=-amount&stage=${OPEN_STAGE_VALUES}`;

export default function TmaPipelinePage() {
  const { phase } = useTmaAuth();
  const [opps, setOpps] = useState<Opportunity[] | null>(null);
  const [count, setCount] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const page = await apiListPage<Opportunity>(LIST_PATH);
        if (!cancelled) {
          setOpps(page.results);
          setCount(page.count);
          setNext(page.next);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load pipeline");
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
      const page = await apiListPage<Opportunity>(next);
      setOpps((prev) => [...(prev ?? []), ...page.results]);
      setCount(page.count);
      setNext(page.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [next, loadingMore]);

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const stage of OPEN_STAGES) map.set(stage.value, []);
    for (const opp of opps ?? []) {
      if (opp.stage === "closed_won" || opp.stage === "closed_lost") continue;
      const list = map.get(opp.stage) ?? [];
      list.push(opp);
      map.set(opp.stage, list);
    }
    return map;
  }, [opps]);

  if (error && opps === null) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (opps === null) return <Empty>Loading pipeline…</Empty>;

  return (
    <div className="space-y-4">
      <Link href="/tma" className="text-xs text-[var(--cyan)] hover:underline">
        ← Home
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          Pipeline
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Open deals by stage.</p>
      </div>

      {OPEN_STAGES.map((stage) => {
        const rows = byStage.get(stage.value) ?? [];
        return (
          <section key={stage.value} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">
                {stage.label}
              </h2>
              <Badge>{rows.length}</Badge>
            </div>
            {rows.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Empty</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((opp) => (
                  <li key={opp.id}>
                    <Link href={`/tma/opportunities/${opp.id}`}>
                      <Card className="transition hover:border-[var(--accent)]">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{opp.name}</p>
                            <p className="truncate text-xs text-[var(--muted)]">
                              {opp.account_name}
                            </p>
                          </div>
                          <Money value={opp.amount} />
                        </div>
                        {opp.is_stale || opp.health === "at_risk" ? (
                          <div className="mt-2 flex gap-1">
                            {opp.is_stale ? <Badge tone="warn">stale</Badge> : null}
                            {opp.health === "at_risk" ? <Badge tone="warn">at risk</Badge> : null}
                          </div>
                        ) : null}
                        <p className="mt-1 text-[10px] text-[var(--muted)]">
                          {labelFor(OPP_STAGES, opp.stage)}
                        </p>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <TmaLoadMore
        shown={opps.length}
        total={count}
        next={next}
        loading={loadingMore}
        onLoadMore={loadMore}
      />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
