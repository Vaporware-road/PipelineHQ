"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { apiList } from "@/lib/api";
import type { JobRun } from "@/lib/types";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setJobs(await apiList<JobRun>("/api/jobs/"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <PageHeader
        title="Background jobs"
        subtitle="Celery task status for imports, exports, stale scans, and demo reset. Auto-refreshes."
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
                <td className="text-xs">{new Date(job.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 ? <Empty>No jobs yet — try CSV import or forecast export.</Empty> : null}
      </Card>
    </div>
  );
}
