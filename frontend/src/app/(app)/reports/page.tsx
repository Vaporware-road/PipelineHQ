"use client";

import { useEffect, useState } from "react";
import { BarChart, FunnelChart } from "@/components/charts";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Button, Card, Empty, Money, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { defaultRange, qs, type DateRange } from "@/lib/dateRange";
import type { AnalyticsActivity, AnalyticsFunnel, AnalyticsOverview, JobRun } from "@/lib/types";

export default function ReportsPage() {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [funnel, setFunnel] = useState<AnalyticsFunnel | null>(null);
  const [activity, setActivity] = useState<AnalyticsActivity | null>(null);
  const [job, setJob] = useState<JobRun | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      api<AnalyticsOverview>(`/api/analytics/overview/?${qs(range)}`),
      api<AnalyticsFunnel>(`/api/analytics/funnel/?${qs(range)}`),
      api<AnalyticsActivity>(`/api/analytics/activity/?${qs(range)}`),
    ])
      .then(([o, f, a]) => {
        if (cancelled) return;
        setOverview(o);
        setFunnel(f);
        setActivity(a);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  useEffect(() => {
    if (!job || job.status === "success" || job.status === "failed") return;
    const id = setInterval(() => {
      api<JobRun>(`/api/jobs/${job.id}/`)
        .then(setJob)
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(id);
  }, [job]);

  async function exportCsv() {
    setBusy(true);
    setError("");
    try {
      const j = await api<JobRun>("/api/analytics/export/", {
        method: "POST",
        body: JSON.stringify({ from: range.from, to: range.to }),
      });
      setJob(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  const funnelSteps = funnel
    ? [
        { label: "leads", count: funnel.leads_created },
        { label: "converted", count: funnel.leads_converted },
        ...funnel.stages.map((s) => ({ label: s.stage, count: s.count })),
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Funnel, activity mix, and CSV export via Celery."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} />
            <Button disabled={busy} onClick={exportCsv}>
              Export CSV
            </Button>
          </>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {job ? (
        <Card className="mb-4">
          <p className="text-sm">
            Job #{job.id} · {job.type} · <strong>{job.status}</strong> — {job.message}
          </p>
          {job.result_file_url ? (
            <a className="mt-2 inline-block text-sm text-[var(--accent)] underline" href={job.result_file_url}>
              Download export
            </a>
          ) : null}
        </Card>
      ) : null}

      {!overview || !funnel || !activity ? (
        <Empty>Loading reports…</Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Mini label="Leads" value={overview.leads_created} />
            <Mini label="Conversion" value={`${overview.conversion_rate}%`} />
            <Mini label="Won $" value={<Money value={overview.won_amount} />} />
            <Mini label="Activities" value={activity.total} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Stage funnel</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {overview.from} → {overview.to}
              </p>
              <div className="mt-4">
                <FunnelChart steps={funnelSteps} />
              </div>
            </Card>
            <Card>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Activity by type</h2>
              <div className="mt-4">
                <BarChart
                  items={activity.by_type.map((r) => ({ label: r.type, count: r.count }))}
                />
              </div>
            </Card>
          </div>

          <Card className="mt-4 overflow-x-auto">
            <h2 className="font-[family-name:var(--font-display)] text-lg">Activity by user</h2>
            <table className="mt-3">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Activities</th>
                </tr>
              </thead>
              <tbody>
                {activity.by_user.map((row) => (
                  <tr key={row.user_id}>
                    <td>{row.username}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activity.by_user.length === 0 ? <Empty>No activities in this range.</Empty> : null}
          </Card>
        </>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">{value}</p>
    </Card>
  );
}
