"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { JobRun, LeadRoutingRule } from "@/lib/types";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rules, setRules] = useState<LeadRoutingRule[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobRun | null>(null);

  useEffect(() => {
    if (!loading && user && user.role !== "MANAGER") {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  async function load() {
    try {
      setRules(await apiList<LeadRoutingRule>("/api/routing-rules/"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load routing");
    }
  }

  useEffect(() => {
    if (user?.role === "MANAGER") load();
  }, [user?.role]);

  async function toggle(rule: LeadRoutingRule) {
    setBusy(true);
    setError("");
    try {
      const updated = await api<LeadRoutingRule>(`/api/routing-rules/${rule.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    if (!window.confirm("Reset all demo CRM data and reseed? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      setJob(await api<JobRun>("/api/ops/reset-demo/", { method: "POST" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user || user.role !== "MANAGER") {
    return <Empty>Manager access only…</Empty>;
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manager controls for automation and portfolio demos."
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <Card className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Demo workspace</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Wipe leads, deals, tasks, sequences, and notifications, then reseed the walkthrough dataset.
              Requires a Celery worker. Track progress on{" "}
              <Link href="/jobs" className="underline">
                Jobs
              </Link>
              .
            </p>
          </div>
          <Button variant="danger" disabled={busy} onClick={resetDemo}>
            Reset demo data
          </Button>
        </div>
        {job ? (
          <p className="mt-3 text-sm">
            Job #{job.id} · {job.type} · <strong>{job.status}</strong>
            {job.message ? ` — ${job.message}` : null}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Lead routing</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          When enabled, new leads (without an explicit owner) are round-robined to SDRs and the assignee gets an
          in-app notification.
        </p>
        <div className="mt-4 space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col gap-3 rounded-lg border border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{rule.name}</p>
                  <Badge tone={rule.enabled ? "ok" : "neutral"}>{rule.enabled ? "enabled" : "disabled"}</Badge>
                  <Badge>{rule.strategy.replace("_", " ")}</Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Source filter: {rule.source || "all sources"}
                  {rule.last_assignee
                    ? ` · last assignee: ${rule.last_assignee.username}`
                    : " · no assignments yet"}
                </p>
              </div>
              <Button disabled={busy} onClick={() => toggle(rule)}>
                {rule.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          ))}
          {rules.length === 0 ? <Empty>No routing rules.</Empty> : null}
        </div>
      </Card>
    </div>
  );
}
