"use client";

import { useEffect, useState } from "react";
import { BarChart, FunnelChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Badge, Card, Empty, Money, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { defaultRange, qs, type DateRange } from "@/lib/dateRange";
import type { AnalyticsFunnel, AnalyticsOverview, Dashboard } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [snap, setSnap] = useState<Dashboard | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [funnel, setFunnel] = useState<AnalyticsFunnel | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/api/dashboard/")
      .then(setSnap)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      api<AnalyticsOverview>(`/api/analytics/overview/?${qs(range)}`),
      api<AnalyticsFunnel>(`/api/analytics/funnel/?${qs(range)}`),
    ])
      .then(([o, f]) => {
        if (cancelled) return;
        setOverview(o);
        setFunnel(f);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const funnelSteps = funnel
    ? [
        { label: "leads", count: funnel.leads_created },
        { label: "converted", count: funnel.leads_converted },
        ...funnel.stages
          .filter((s) => !["closed_won", "closed_lost"].includes(s.stage))
          .map((s) => ({ label: s.stage, count: s.count })),
        {
          label: "closed won",
          count: funnel.stages.find((s) => s.stage === "closed_won")?.count ?? 0,
        },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          user
            ? `Scoped to your ${user.role} view · live KPIs + date-range analytics (Redis-cached)`
            : undefined
        }
        actions={<DateRangePicker value={range} onChange={setRange} />}
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      {!overview || !snap ? (
        <Empty>Loading metrics…</Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Open pipeline" value={<Money value={snap.pipeline_amount} />} />
            <Stat label="Open deals" value={snap.open_deals} />
            <Stat label="Stale deals" value={snap.stale_deals} warn={snap.stale_deals > 0} />
            <Stat label="Won (all time)" value={<Money value={snap.won_amount} />} />
          </div>

          <p className="mt-6 mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">
            Range {overview.from} → {overview.to}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Leads created" value={overview.leads_created} />
            <Stat label="Conversion rate" value={`${overview.conversion_rate}%`} />
            <Stat label="Won in range" value={<Money value={overview.won_amount} />} />
            <Stat label="Avg cycle days" value={overview.avg_cycle_days} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Leads converted" value={overview.leads_converted} />
            <Stat label="Lost in range" value={<Money value={overview.lost_amount} />} />
            <Stat label="Won deals" value={overview.won_count} />
            <Stat label="Lost deals" value={overview.lost_count} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Conversion funnel</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Lead → opp rate {funnel?.lead_to_opp_rate ?? 0}% · {funnel?.opportunities_created ?? 0}{" "}
                opps created
              </p>
              <div className="mt-4">
                <FunnelChart steps={funnelSteps} />
              </div>
            </Card>
            <Card>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Open pipeline by stage</h2>
              <div className="mt-4">
                <BarChart
                  items={snap.by_stage.map((r) => ({ label: r.stage, count: r.count }))}
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
        {warn ? <Badge tone="warn">needs attention</Badge> : null}
      </div>
      <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">{value}</p>
    </Card>
  );
}
