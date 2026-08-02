"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useRealtime, type RealtimeMessage } from "@/lib/realtime";
import type { JobRun } from "@/lib/types";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setJobs(await apiList<JobRun>("/api/jobs/"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    }
  }, []);

  const { connected } = useRealtime(
    useCallback((msg: RealtimeMessage) => {
      if (msg.event !== "job_update") return;
      const job = msg.payload as unknown as JobRun;
      if (!job?.id) return;
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === job.id);
        if (idx === -1) return [job, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], ...job };
        return next;
      });
    }, []),
  );

  useEffect(() => {
    load();
    const ms = connected ? 15_000 : 4_000;
    const id = setInterval(load, ms);
    return () => clearInterval(id);
  }, [load, connected]);

  return (
    <div>
      <PageHeader
        title="Background jobs"
        subtitle={`Celery task status for imports, exports, stale scans, and demo reset. ${connected ? "Live updates on." : "Polling fallback."}`}
        actions={
          <Button variant="ghost" onClick={load}>
            Refresh
          </Button>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <Card className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Status</th>
              <th>Message</th>
              <th>Task</th>
              <th>File</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.id}</td>
                <td>{job.type}</td>
                <td>
                  <Badge
                    tone={
                      job.status === "success" ? "ok" : job.status === "failed" ? "warn" : "neutral"
                    }
                  >
                    {job.status}
                  </Badge>
                </td>
                <td className="max-w-xs">{job.message}</td>
                <td className="font-mono text-xs">{job.celery_task_id || "—"}</td>
                <td>
                  {job.result_file_url ? (
                    <a className="text-[var(--accent)] underline" href={job.result_file_url}>
                      Download
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-xs">{formatDateTime(job.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 ? <Empty>No jobs yet — try CSV import or forecast export.</Empty> : null}
      </Card>
    </div>
  );
}
