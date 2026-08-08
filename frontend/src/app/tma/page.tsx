"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, Empty, Money } from "@/components/ui";
import { api } from "@/lib/api";
import { telegramBotHref, telegramBotUsername } from "@/lib/telegram";
import { useTmaAuth } from "@/lib/tma-auth";
import { labelFor, OPP_STAGES } from "@/lib/tma-constants";
import type { Dashboard } from "@/lib/types";

export default function TmaHomePage() {
  const { phase } = useTmaAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const botUser = telegramBotUsername();
  const botHref = telegramBotHref();

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const dash = await api<Dashboard>("/api/dashboard/");
        if (!cancelled) setData(dash);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!data) return <Empty>Loading dashboard…</Empty>;

  const openStages = data.by_stage.filter(
    (s) => s.stage !== "closed_won" && s.stage !== "closed_lost",
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          Tracker
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Pipeline pulse for your book.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/tma/pipeline">
          <Card className="transition hover:border-[var(--accent)]">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Pipeline</p>
            <p className="mt-1 text-lg font-semibold">
              <Money value={data.pipeline_amount} />
            </p>
          </Card>
        </Link>
        <Link href="/tma/pipeline">
          <Card className="transition hover:border-[var(--accent)]">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Open deals</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{data.open_deals}</p>
          </Card>
        </Link>
        <Link href="/tma/leads">
          <Card className="transition hover:border-[var(--accent)]">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Open leads</p>
            <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{data.leads_open}</p>
          </Card>
        </Link>
        <Link href="/tma/pipeline">
          <Card className="transition hover:border-[var(--accent)]">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">Won</p>
            <p className="mt-1 text-lg font-semibold">
              <Money value={data.won_amount} />
            </p>
          </Card>
        </Link>
      </div>

      {(data.stale_deals > 0 || data.at_risk_deals > 0) && (
        <Link href="/tma/pipeline">
          <Card className="flex flex-wrap gap-2 transition hover:border-[var(--accent)]">
            {data.stale_deals > 0 ? <Badge tone="warn">{data.stale_deals} stale</Badge> : null}
            {data.at_risk_deals > 0 ? (
              <Badge tone="warn">{data.at_risk_deals} at risk</Badge>
            ) : null}
          </Card>
        </Link>
      )}

      <Card>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">By stage</p>
        <ul className="mt-3 space-y-2">
          {openStages.length === 0 ? (
            <li className="text-sm text-[var(--muted)]">No open stages</li>
          ) : (
            openStages.map((row) => (
              <li key={row.stage}>
                <Link
                  href="/tma/pipeline"
                  className="flex items-center justify-between gap-2 text-sm hover:text-[var(--accent)]"
                >
                  <span>{labelFor(OPP_STAGES, row.stage)}</span>
                  <span className="tabular-nums text-[var(--muted)]">
                    {row.count} · <Money value={row.amount} />
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/tma/leads"
          className="rounded-lg border border-[var(--line)] px-3 py-3 text-center text-sm text-[var(--ink)] hover:border-[var(--accent)]"
        >
          Leads
        </Link>
        <Link
          href="/tma/pipeline"
          className="rounded-lg border border-[var(--line)] px-3 py-3 text-center text-sm text-[var(--ink)] hover:border-[var(--accent)]"
        >
          Pipeline
        </Link>
        <Link
          href="/tma/schedule"
          className="rounded-lg border border-[var(--line)] px-3 py-3 text-center text-sm text-[var(--ink)] hover:border-[var(--accent)]"
        >
          Schedule
        </Link>
        <Link
          href="/tma/clients"
          className="rounded-lg border border-[var(--line)] px-3 py-3 text-center text-sm text-[var(--ink)] hover:border-[var(--accent)]"
        >
          Clients
        </Link>
      </div>

      {botHref ? (
        <p className="text-center text-xs text-[var(--muted)]">
          Bot:{" "}
          <a href={botHref} className="text-[var(--cyan)] hover:underline" target="_blank" rel="noreferrer">
            @{botUser}
          </a>
        </p>
      ) : null}
    </div>
  );
}
