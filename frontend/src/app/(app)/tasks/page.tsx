"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DatePicker } from "@/components/DateTimeFields";
import { Badge, Button, Card, Empty, Input, PageHeader, Select } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { CrmTask, Lead, Opportunity } from "@/lib/types";

export default function TasksPage() {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [filter, setFilter] = useState<"mine" | "overdue" | "all">("mine");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    due_at: "",
    priority: "medium",
    lead: "",
    opportunity: "",
  });

  async function load(next = filter) {
    try {
      const qs =
        next === "overdue"
          ? "?mine=1&overdue=1&roots=1"
          : next === "mine"
            ? "?mine=1&roots=1"
            : "?roots=1";
      setTasks(await apiList<CrmTask>(`/api/tasks/${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    }
  }

  useEffect(() => {
    load(filter);
  }, [filter]);

  useEffect(() => {
    Promise.all([apiList<Lead>("/api/leads/"), apiList<Opportunity>("/api/opportunities/")])
      .then(([l, o]) => {
        setLeads(l.filter((x) => x.status !== "converted").slice(0, 100));
        setOpps(o.slice(0, 100));
      })
      .catch(() => undefined);
  }, []);

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

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/tasks/", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          due_at: form.due_at || null,
          priority: form.priority,
          lead: form.lead ? Number(form.lead) : null,
          opportunity: form.opportunity ? Number(form.opportunity) : null,
        }),
      });
      setForm({ title: "", description: "", due_at: "", priority: "medium", lead: "", opportunity: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
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
        subtitle="Click a task for creator, comments, and subtask tree."
        actions={
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["mine", "Mine"],
                ["overdue", "Overdue"],
                ["all", "All"],
              ] as const
            ).map(([key, label]) => (
              <Button key={key} variant={filter === key ? "primary" : "ghost"} onClick={() => setFilter(key)}>
                {label}
              </Button>
            ))}
          </div>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <Card className="mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg">New task</h2>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={createTask}>
          <Input
            className="sm:col-span-2"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <Input
            className="sm:col-span-2"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <DatePicker
            mode="datetime"
            placeholder="Due"
            value={form.due_at}
            onChange={(due_at) => setForm({ ...form, due_at })}
          />
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
          <Select value={form.lead} onChange={(e) => setForm({ ...form, lead: e.target.value })}>
            <option value="">No lead</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Select value={form.opportunity} onChange={(e) => setForm({ ...form, opportunity: e.target.value })}>
            <option value="">No deal</option>
            {opps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={busy} className="sm:col-span-2">
            Create task
          </Button>
        </form>
      </Card>

      <TaskSection title="Open" tasks={open} busy={busy} onToggle={toggleComplete} />
      <TaskSection title="Done" tasks={done} busy={busy} onToggle={toggleComplete} />
    </div>
  );
}

function TaskSection({
  title,
  tasks,
  busy,
  onToggle,
}: {
  title: string;
  tasks: CrmTask[];
  busy: boolean;
  onToggle: (t: CrmTask) => void;
}) {
  return (
    <Card className="mt-4">
      <h2 className="font-[family-name:var(--font-display)] text-lg">{title}</h2>
      <ul className="mt-3 space-y-2">
        {tasks.map((task) => {
          const overdue = !task.completed && task.due_at && new Date(task.due_at) < new Date();
          return (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--line)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <Link href={`/tasks/${task.id}`} className="font-medium text-[var(--cyan)] hover:underline">
                  {task.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <Badge tone={overdue ? "warn" : "neutral"}>{task.status}</Badge>
                  <span>{task.priority}</span>
                  {task.due_at ? <span>Due {formatDateTime(task.due_at)}</span> : null}
                  <span>Owner {task.owner?.username}</span>
                  {task.created_by ? <span>Created by {task.created_by.username}</span> : null}
                  {task.opportunity ? (
                    <Link href={`/opportunities/${task.opportunity}`} className="text-[var(--cyan)] hover:underline">
                      {task.opportunity_name}
                    </Link>
                  ) : null}
                  {task.lead ? (
                    <Link href={`/leads/${task.lead}`} className="text-[var(--cyan)] hover:underline">
                      {task.lead_name}
                    </Link>
                  ) : null}
                </div>
              </div>
              <Button variant="ghost" disabled={busy} onClick={() => onToggle(task)}>
                {task.completed ? "Reopen" : "Complete"}
              </Button>
            </li>
          );
        })}
        {tasks.length === 0 ? <Empty>Nothing here.</Empty> : null}
      </ul>
    </Card>
  );
}
