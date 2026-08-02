"use client";

import { useEffect, useState } from "react";
import { Button, Card, Empty, Money, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Forecast, JobRun } from "@/lib/types";

export default function ForecastPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Forecast | null>(null);
  const [job, setJob] = useState<JobRun | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Forecast>("/api/forecast/")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  async function exportCsv() {
    setBusy(true);
    setError("");
    try {
      const j = await api<JobRun>("/api/forecast/", { method: "POST" });
      setJob(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Forecast"
        subtitle="Commit / best case / pipeline rollups. Managers can export via Celery."
        actions={
          user?.role === "MANAGER" ? (
            <Button disabled={busy} onClick={exportCsv}>
              {busy ? "Exporting…" : "Export CSV"}
            </Button>
          ) : undefined
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
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">Check Jobs page while Celery worker processes this.</p>
          )}
        </Card>
      ) : null}

      {!data ? (
        <Empty>Loading forecast…</Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Pipeline</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">
                <Money value={data.totals.pipeline} />
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Best case</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">
                <Money value={data.totals.best_case} />
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Commit</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">
                <Money value={data.totals.commit} />
              </p>
            </Card>
          </div>
          <Card className="mt-6 overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Deals</th>
                  <th>Pipeline</th>
                  <th>Best case</th>
                  <th>Commit</th>
                </tr>
              </thead>
              <tbody>
                {data.by_owner.map((row) => (
                  <tr key={row.owner_id}>
                    <td>{row.owner}</td>
                    <td>{row.deals}</td>
                    <td>
                      <Money value={row.pipeline} />
                    </td>
                    <td>
                      <Money value={row.best_case} />
                    </td>
                    <td>
                      <Money value={row.commit} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.by_owner.length === 0 ? <Empty>No forecast rows.</Empty> : null}
          </Card>
        </>
      )}
    </div>
  );
}
