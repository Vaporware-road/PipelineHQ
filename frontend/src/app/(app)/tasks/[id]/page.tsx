"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CommentThread } from "@/components/CommentThread";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { CrmTask } from "@/lib/types";

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const [task, setTask] = useState<CrmTask | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [subTitle, setSubTitle] = useState("");

  async function load() {
    try {
      setTask(await api<CrmTask>(`/api/tasks/${params.id}/`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load task");
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      setTask(await api<CrmTask>(`/api/tasks/${params.id}/`, { method: "PATCH", body: JSON.stringify(body) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function addSubtask() {
    if (!subTitle.trim() || !task) return;
    setBusy(true);
    try {
      await api("/api/tasks/", {
        method: "POST",
        body: JSON.stringify({
          title: subTitle,
          parent: task.id,
          lead: task.lead,
          opportunity: task.opportunity,
        }),
      });
      setSubTitle("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Subtask failed");
    } finally {
      setBusy(false);
    }
  }

  if (!task) {
    return (
      <div>
        <PageHeader title="Task" subtitle="Loading…" />
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : <Empty>Loading…</Empty>}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={task.title}
        subtitle={task.status}
        actions={
          <Link href="/tasks" className="text-sm text-[var(--cyan)] hover:underline">
            ← Tasks
          </Link>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Details</h2>
          <div className="mt-3 space-y-3">
            <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
              Title
              <Input
                className="mt-1"
                defaultValue={task.title}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== task.title) patch({ title: e.target.value });
                }}
              />
            </label>
            <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
              Description
              <Textarea
                className="mt-1"
                rows={4}
                defaultValue={task.description}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== task.description) patch({ description: e.target.value });
                }}
              />
            </label>
            <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
              Status
              <Select
                className="mt-1"
                value={task.status}
                disabled={busy}
                onChange={(e) => patch({ status: e.target.value })}
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </Select>
            </label>
            <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
              Priority
              <Select
                className="mt-1"
                value={task.priority}
                disabled={busy}
                onChange={(e) => patch({ priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </label>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              <Badge>{task.status}</Badge>
              <span>Owner: {task.owner?.username}</span>
              <span>Created by: {task.created_by?.username || "—"}</span>
              {task.due_at ? <span>Due {formatDateTime(task.due_at)}</span> : null}
            </div>
            {task.lead ? (
              <Link href={`/leads/${task.lead}`} className="block text-sm text-[var(--cyan)] hover:underline">
                Lead: {task.lead_name}
              </Link>
            ) : null}
            {task.opportunity ? (
              <Link
                href={`/opportunities/${task.opportunity}`}
                className="block text-sm text-[var(--cyan)] hover:underline"
              >
                Deal: {task.opportunity_name}
              </Link>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Task tree</h2>
          <div className="mt-3 flex gap-2">
            <Input placeholder="Subtask title" value={subTitle} onChange={(e) => setSubTitle(e.target.value)} />
            <Button disabled={busy || !subTitle.trim()} onClick={addSubtask}>
              Add
            </Button>
          </div>
          <ul className="mt-3 space-y-2">
            {(task.children || []).map((child) => (
              <li key={child.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/tasks/${child.id}`} className="text-[var(--cyan)] hover:underline">
                  {child.title}
                </Link>
                <div className="flex items-center gap-2">
                  <Badge tone={child.completed ? "ok" : "neutral"}>{child.status}</Badge>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      await api(`/api/tasks/${child.id}/`, {
                        method: "PATCH",
                        body: JSON.stringify({ completed: !child.completed }),
                      });
                      await load();
                    }}
                  >
                    {child.completed ? "Reopen" : "Done"}
                  </Button>
                </div>
              </li>
            ))}
            {(task.children || []).length === 0 ? <Empty>No subtasks.</Empty> : null}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Comments</h2>
          <div className="mt-3">
            <CommentThread endpoint={`/api/tasks/${params.id}/comments/`} />
          </div>
        </Card>
      </div>
    </div>
  );
}
