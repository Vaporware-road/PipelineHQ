"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import type { CrmTask } from "@/lib/types";

export default function TasksPage() {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [filter, setFilter] = useState<"mine" | "overdue" | "all">("mine");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(next = filter) {
    try {
      const qs =
        next === "overdue" ? "?mine=1&overdue=1" : next === "mine" ? "?mine=1" : "";
      setTasks(await apiList<CrmTask>(`/api/tasks/${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    }
  }

  useEffect(() => {
    load(filter);
  }, [filter]);

  async function toggleComplete(task: CrmTask) {
    setBusy(true);
    setError("");
    try {
      const updated = await api<CrmTask>(`/api/tasks/${task.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !task.completed }),
      });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Reminders from deals, leads, and outbound sequences."
        actions={
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["mine", "Mine"],
                ["overdue", "Overdue"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                variant={filter === key ? "primary" : "ghost"}
                disabled={busy}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        }
      />
      {error ? <p className="mb-3 text-sm text-[#b42318]">{error}</p> : null}

      <div className="space-y-3">
        {open.map((task) => (
          <TaskRow key={task.id} task={task} busy={busy} onToggle={toggleComplete} />
        ))}
        {open.length === 0 ? <Empty>No open tasks in this filter.</Empty> : null}
      </div>

      {done.length > 0 ? (
        <Card className="mt-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Completed</h2>
          <div className="mt-3 space-y-2">
            {done.map((task) => (
              <TaskRow key={task.id} task={task} busy={busy} onToggle={toggleComplete} />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  busy,
  onToggle,
}: {
  task: CrmTask;
  busy: boolean;
  onToggle: (task: CrmTask) => void;
}) {
  const overdue =
    !task.completed && task.due_at && new Date(task.due_at).getTime() < Date.now();
  return (
    <Card className={task.completed ? "opacity-70" : ""}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-medium ${task.completed ? "line-through" : ""}`}>{task.title}</p>
            {overdue ? <Badge tone="warn">Overdue</Badge> : null}
            {task.completed ? <Badge tone="ok">Done</Badge> : null}
          </div>
          {task.description ? (
            <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--muted)]">
            {task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"}
            {task.opportunity ? (
              <>
                {" · "}
                <Link className="underline" href={`/opportunities/${task.opportunity}`}>
                  {task.opportunity_name || "Deal"}
                </Link>
              </>
            ) : null}
            {task.lead ? <> · Lead: {task.lead_name}</> : null}
            <> · {task.owner.username}</>
          </p>
        </div>
        <Button variant="ghost" disabled={busy} onClick={() => onToggle(task)}>
          {task.completed ? "Reopen" : "Complete"}
        </Button>
      </div>
    </Card>
  );
}
