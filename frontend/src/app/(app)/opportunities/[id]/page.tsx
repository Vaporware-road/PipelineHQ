"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Input, Money, PageHeader, Select, Textarea } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import type { CrmTask, DealComment, Opportunity } from "@/lib/types";

const MEDDIC_FIELDS: { key: keyof Opportunity; label: string; hint: string }[] = [
  { key: "metrics", label: "Metrics", hint: "Quantified economic impact" },
  { key: "economic_buyer", label: "Economic buyer", hint: "Who signs / owns budget" },
  { key: "decision_criteria", label: "Decision criteria", hint: "Must-haves to win" },
  { key: "decision_process", label: "Decision process", hint: "Steps + stakeholders" },
  { key: "identify_pain", label: "Identify pain", hint: "Required for Proposal+" },
  { key: "champion", label: "Champion", hint: "Required for Proposal+" },
];

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState({ type: "note", subject: "", body: "" });
  const [commentBody, setCommentBody] = useState("");
  const [taskForm, setTaskForm] = useState({ title: "", due_at: "" });
  const [closeModal, setCloseModal] = useState<"closed_won" | "closed_lost" | null>(null);
  const [closeReason, setCloseReason] = useState("");

  async function load() {
    try {
      const [data, dealTasks] = await Promise.all([
        api<Opportunity>(`/api/opportunities/${params.id}/`),
        apiList<CrmTask>(`/api/tasks/?opportunity=${params.id}`),
      ]);
      setOpp(data);
      setTasks(dealTasks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function saveField(patch: Partial<Opportunity>) {
    setBusy(true);
    setError("");
    try {
      setOpp(
        await api<Opportunity>(`/api/opportunities/${params.id}/`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function onStageSelect(stage: string) {
    if (stage === "closed_won" || stage === "closed_lost") {
      setCloseReason("");
      setCloseModal(stage);
      return;
    }
    await saveField({ stage });
  }

  async function confirmClose() {
    if (!closeModal || !closeReason.trim()) {
      setError("A close reason is required.");
      return;
    }
    const patch: Partial<Opportunity> = { stage: closeModal };
    if (closeModal === "closed_won") patch.win_reason = closeReason.trim();
    else patch.loss_reason = closeReason.trim();
    try {
      await saveField(patch);
      setCloseModal(null);
      setCloseReason("");
    } catch {
      /* error already set */
    }
  }

  async function addActivity(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/activities/", {
        method: "POST",
        body: JSON.stringify({
          opportunity: Number(params.id),
          ...activity,
        }),
      });
      setActivity({ type: "note", subject: "", body: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activity failed");
    } finally {
      setBusy(false);
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<DealComment>(`/api/opportunities/${params.id}/comments/`, {
        method: "POST",
        body: JSON.stringify({ body: commentBody }),
      });
      setCommentBody("");
      setOpp((prev) => (prev ? { ...prev, comments: [...(prev.comments || []), created] } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comment failed");
    } finally {
      setBusy(false);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<CrmTask>("/api/tasks/", {
        method: "POST",
        body: JSON.stringify({
          title: taskForm.title.trim(),
          opportunity: Number(params.id),
          due_at: taskForm.due_at ? new Date(taskForm.due_at).toISOString() : null,
        }),
      });
      setTaskForm({ title: "", due_at: "" });
      setTasks((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(task: CrmTask) {
    setBusy(true);
    setError("");
    try {
      const updated = await api<CrmTask>(`/api/tasks/${task.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !task.completed }),
      });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!opp && !error) return <Empty>Loading deal…</Empty>;
  if (!opp) return <p className="text-sm text-[#b42318]">{error}</p>;

  const checklist = opp.meddic_checklist || {};
  const filled = Object.values(checklist).filter(Boolean).length;
  const openTasks = tasks.filter((t) => !t.completed);

  return (
    <div>
      <PageHeader
        title={opp.name}
        subtitle={`${opp.account_name} · owned by ${opp.owner.username}`}
        actions={opp.is_stale ? <Badge tone="warn">Stale deal</Badge> : undefined}
      />
      {error ? <p className="mb-3 text-sm text-[#b42318]">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 space-y-3">
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">Amount</label>
          <Input
            type="number"
            defaultValue={opp.amount}
            onBlur={(e) => saveField({ amount: e.target.value })}
          />
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">Stage</label>
          <Select value={opp.stage} disabled={busy} onChange={(e) => onStageSelect(e.target.value)}>
            <option value="discovery">Discovery</option>
            <option value="demo">Demo</option>
            <option value="proposal">Proposal</option>
            <option value="negotiation">Negotiation</option>
            <option value="closed_won">Closed Won</option>
            <option value="closed_lost">Closed Lost</option>
          </Select>
          {opp.win_reason ? (
            <div>
              <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">Win reason</label>
              <p className="mt-1 text-sm">{opp.win_reason}</p>
            </div>
          ) : null}
          {opp.loss_reason ? (
            <div>
              <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">Loss reason</label>
              <p className="mt-1 text-sm">{opp.loss_reason}</p>
            </div>
          ) : null}
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">Forecast</label>
          <Select
            value={opp.forecast_category}
            disabled={busy}
            onChange={(e) => saveField({ forecast_category: e.target.value })}
          >
            <option value="pipeline">Pipeline</option>
            <option value="best_case">Best Case</option>
            <option value="commit">Commit</option>
          </Select>
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">Close date</label>
          <Input
            type="date"
            defaultValue={opp.close_date}
            onBlur={(e) => saveField({ close_date: e.target.value })}
          />
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">Next step</label>
          <Input
            defaultValue={opp.next_step}
            onBlur={(e) => saveField({ next_step: e.target.value })}
          />
          <p className="text-sm text-[var(--muted)]">
            Value: <Money value={opp.amount} />
          </p>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-lg">MEDDIC checklist</h2>
              <Badge tone={filled >= 4 ? "ok" : "warn"}>
                {filled}/6 filled · Proposal needs champion + pain
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Stage gates block Proposal without champion + identify pain; Negotiation also needs economic buyer.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {MEDDIC_FIELDS.map((field) => {
                const done = checklist[field.key as string];
                return (
                  <label key={field.key} className="block">
                    <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]">
                      {field.label}
                      <span className={done ? "text-emerald-700" : "text-amber-700"}>{done ? "✓" : "○"}</span>
                    </span>
                    {field.key === "metrics" ||
                    field.key === "decision_criteria" ||
                    field.key === "decision_process" ||
                    field.key === "identify_pain" ? (
                      <Textarea
                        rows={2}
                        placeholder={field.hint}
                        defaultValue={(opp[field.key] as string) || ""}
                        onBlur={(e) => {
                          if (e.target.value !== (opp[field.key] || "")) {
                            saveField({ [field.key]: e.target.value } as Partial<Opportunity>);
                          }
                        }}
                      />
                    ) : (
                      <Input
                        placeholder={field.hint}
                        defaultValue={(opp[field.key] as string) || ""}
                        onBlur={(e) => {
                          if (e.target.value !== (opp[field.key] || "")) {
                            saveField({ [field.key]: e.target.value } as Partial<Opportunity>);
                          }
                        }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-[family-name:var(--font-display)] text-lg">Tasks</h2>
              <Badge>{openTasks.length} open</Badge>
            </div>
            <div className="mt-3 space-y-2">
              {tasks.map((task) => {
                const overdue =
                  !task.completed && task.due_at && new Date(task.due_at).getTime() < Date.now();
                return (
                  <div
                    key={task.id}
                    className="flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className={`text-sm font-medium ${task.completed ? "line-through opacity-70" : ""}`}>
                        {task.title}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"}
                        {overdue ? " · overdue" : ""}
                      </p>
                    </div>
                    <Button variant="ghost" disabled={busy} onClick={() => toggleTask(task)}>
                      {task.completed ? "Reopen" : "Complete"}
                    </Button>
                  </div>
                );
              })}
              {tasks.length === 0 ? <Empty>No tasks on this deal.</Empty> : null}
            </div>
            <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]" onSubmit={addTask}>
              <Input
                placeholder="New task title"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                required
              />
              <Input
                type="datetime-local"
                value={taskForm.due_at}
                onChange={(e) => setTaskForm({ ...taskForm, due_at: e.target.value })}
              />
              <Button type="submit" disabled={busy || !taskForm.title.trim()}>
                Add task
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Comments</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Use @username (e.g. @manager) to notify teammates in Alerts.
            </p>
            <div className="mt-3 space-y-3">
              {(opp.comments || []).map((c) => (
                <div key={c.id} className="rounded-lg border border-[var(--line)] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="font-medium text-[var(--ink)]">{c.author.username}</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                </div>
              ))}
              {(opp.comments || []).length === 0 ? <Empty>No comments yet.</Empty> : null}
            </div>
            <form className="mt-3 grid gap-2" onSubmit={addComment}>
              <Textarea
                rows={3}
                placeholder="Add a comment… try @ae or @manager"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                required
              />
              <Button type="submit" disabled={busy || !commentBody.trim()}>
                Post comment
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Log activity</h2>
            <form className="mt-3 grid gap-2" onSubmit={addActivity}>
              <Select value={activity.type} onChange={(e) => setActivity({ ...activity, type: e.target.value })}>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="note">Note</option>
              </Select>
              <Input
                placeholder="Subject"
                value={activity.subject}
                onChange={(e) => setActivity({ ...activity, subject: e.target.value })}
                required
              />
              <Textarea
                placeholder="Notes"
                rows={3}
                value={activity.body}
                onChange={(e) => setActivity({ ...activity, body: e.target.value })}
              />
              <Button type="submit" disabled={busy}>
                Add activity
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Timeline</h2>
            <div className="mt-3 space-y-3">
              {(opp.activities || []).map((a) => (
                <div key={a.id} className="border-l-2 border-[var(--accent)] pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{a.type}</Badge>
                    <span className="font-medium">{a.subject}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {new Date(a.created_at).toLocaleString()} · {a.created_by.username}
                    </span>
                  </div>
                  {a.body ? <p className="mt-1 text-sm text-[var(--muted)]">{a.body}</p> : null}
                </div>
              ))}
              {(opp.activities || []).length === 0 ? <Empty>No activities yet.</Empty> : null}
            </div>
          </Card>
        </div>
      </div>

      {closeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setCloseModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              {closeModal === "closed_won" ? "Close as won" : "Close as lost"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {closeModal === "closed_won"
                ? "Record why you won — required before the stage updates."
                : "Record why you lost — required before the stage updates."}
            </p>
            <Textarea
              className="mt-3"
              rows={4}
              placeholder={closeModal === "closed_won" ? "Win reason" : "Loss reason"}
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCloseModal(null)}>
                Cancel
              </Button>
              <Button disabled={busy || !closeReason.trim()} onClick={confirmClose}>
                Confirm close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
