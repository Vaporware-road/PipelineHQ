"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DatePicker, DateTimeFields } from "@/components/DateTimeFields";
import { TimelineFeed } from "@/components/TimelineFeed";
import { CommentThread } from "@/components/CommentThread";
import { CustomFieldsPanel } from "@/components/CustomFieldsPanel";
import { AiAssistPanel } from "@/components/AiAssistPanel";
import { Badge, Button, Card, Empty, Input, Money, PageHeader, Select, Textarea } from "@/components/ui";
import { API_URL, api, apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { CrmTask, Opportunity, OutboundEmail, Product, Quote } from "@/lib/types";

const MEDDIC_FIELDS: { key: keyof Opportunity; label: string; hint: string }[] = [
  { key: "metrics", label: "Metrics", hint: "Quantified economic impact" },
  { key: "economic_buyer", label: "Economic buyer", hint: "Who signs / owns budget" },
  { key: "decision_criteria", label: "Decision criteria", hint: "Must-haves to win" },
  { key: "decision_process", label: "Decision process", hint: "Steps + stakeholders" },
  { key: "identify_pain", label: "Identify pain", hint: "Required for Proposal+" },
  { key: "champion", label: "Champion", hint: "Required for Proposal+" },
];

const HEALTH_TONE: Record<string, "ok" | "warn" | "neutral"> = {
  healthy: "ok",
  at_risk: "warn",
  stalled: "warn",
};

export default function OpportunityDetailPage() {
  const params = useParams<{ id: string }>();
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState({ type: "note", subject: "", body: "" });
  const [taskForm, setTaskForm] = useState({ title: "", due_at: "" });
  const [closeModal, setCloseModal] = useState<"closed_won" | "closed_lost" | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [timelineKey, setTimelineKey] = useState(0);
  const [emailForm, setEmailForm] = useState({ to_email: "", subject: "", body: "" });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quoteForm, setQuoteForm] = useState({
    name: "",
    discount_percent: "0",
    product_id: "",
    quantity: "1",
  });

  async function load() {
    try {
      const [data, dealTasks, dealQuotes, catalog] = await Promise.all([
        api<Opportunity>(`/api/opportunities/${params.id}/`),
        apiList<CrmTask>(`/api/tasks/?opportunity=${params.id}`),
        apiList<Quote>(`/api/quotes/?opportunity=${params.id}`),
        apiList<Product>(`/api/products/?is_active=true`),
      ]);
      setOpp(data);
      setTasks(dealTasks);
      setQuotes(dealQuotes);
      setProducts(catalog);
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

  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    const product = products.find((p) => String(p.id) === quoteForm.product_id);
    if (!product || !quoteForm.name.trim()) {
      setError("Quote name and a product are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api<Quote>("/api/quotes/", {
        method: "POST",
        body: JSON.stringify({
          opportunity: Number(params.id),
          name: quoteForm.name.trim(),
          discount_percent: quoteForm.discount_percent || "0",
          line_items: [
            {
              product: product.id,
              description: product.name,
              quantity: quoteForm.quantity || "1",
              unit_price: product.unit_price,
            },
          ],
        }),
      });
      setQuoteForm({ name: "", discount_percent: "0", product_id: "", quantity: "1" });
      setQuotes(await apiList<Quote>(`/api/quotes/?opportunity=${params.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote create failed");
    } finally {
      setBusy(false);
    }
  }

  async function quoteAction(quoteId: number, action: "send" | "approve" | "reject" | "accept") {
    setBusy(true);
    setError("");
    try {
      await api(`/api/quotes/${quoteId}/${action}/`, { method: "POST" });
      setQuotes(await apiList<Quote>(`/api/quotes/?opportunity=${params.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quote action failed");
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(quoteId: number) {
    try {
      const token = localStorage.getItem("pipelinehq_access");
      const res = await fetch(
        `${API_URL}/api/quotes/${quoteId}/preview/`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("Preview failed");
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
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
      setTimelineKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activity failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api<OutboundEmail>("/api/emails/", {
        method: "POST",
        body: JSON.stringify({
          to_email: emailForm.to_email,
          subject: emailForm.subject,
          body: emailForm.body,
          opportunity: Number(params.id),
          contact: opp?.primary_contact || null,
        }),
      });
      setEmailForm({ to_email: emailForm.to_email, subject: "", body: "" });
      setTimelineKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
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
  if (!opp) return <p className="text-sm text-[var(--danger)]">{error}</p>;

  const checklist = opp.meddic_checklist || {};
  const filled = Object.values(checklist).filter(Boolean).length;
  const openTasks = tasks.filter((t) => !t.completed);

  return (
    <div>
      <PageHeader
        title={opp.name}
        subtitle={`${opp.account_name} · owned by ${opp.owner.username}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {opp.health ? (
              <span title={(opp.health_reasons || []).map((r) => r.detail).join(" · ")}>
                <Badge tone={HEALTH_TONE[opp.health] || "neutral"}>
                  {opp.health.replace("_", " ")}
                </Badge>
              </span>
            ) : null}
            {opp.is_stale ? <Badge tone="warn">Stale deal</Badge> : null}
          </div>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

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
          <DatePicker
            mode="date"
            label="Close date"
            value={opp.close_date || ""}
            onChange={(close_date) => {
              if (close_date !== (opp.close_date || "")) saveField({ close_date });
            }}
          />
          <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">Next step</label>
          <Input
            defaultValue={opp.next_step}
            onBlur={(e) => saveField({ next_step: e.target.value })}
          />
          <p className="text-sm text-[var(--muted)]">
            Value: <Money value={opp.amount} />
          </p>
          <CustomFieldsPanel
            entity="opportunity"
            values={opp.custom_fields || {}}
            disabled={busy}
            onSave={(patch) => saveField({ custom_fields: { ...(opp.custom_fields || {}), ...patch } })}
          />
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <AiAssistPanel
            opportunity={opp}
            onOpportunityPatch={setOpp}
            onEmailDraft={(draft) =>
              setEmailForm({
                to_email: draft.to_email || emailForm.to_email,
                subject: draft.subject,
                body: draft.body,
              })
            }
          />
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
                      <span className={done ? "text-[var(--cyan)]" : "text-[#ffc857]"}>{done ? "✓" : "○"}</span>
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
              <h2 className="font-[family-name:var(--font-display)] text-lg">Quotes</h2>
              <Badge>{quotes.length}</Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              CPQ-lite — discounts over 20% need Sales Manager approval before send.
            </p>
            <div className="mt-3 space-y-3">
              {quotes.map((quote) => (
                <div key={quote.id} className="rounded-lg border border-[var(--line)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{quote.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        Discount {quote.discount_percent}% · <Money value={quote.total} />
                      </p>
                    </div>
                    <Badge
                      tone={
                        quote.status === "accepted" || quote.status === "sent"
                          ? "ok"
                          : quote.status === "pending_approval" || quote.status === "rejected"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {quote.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                    {(quote.line_items || []).map((line) => (
                      <li key={line.id}>
                        {line.description} × {line.quantity} @ <Money value={line.unit_price} />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="ghost" disabled={busy} onClick={() => openPreview(quote.id)}>
                      Preview
                    </Button>
                    {quote.status === "draft" ? (
                      <Button variant="ghost" disabled={busy} onClick={() => quoteAction(quote.id, "send")}>
                        Mark sent
                      </Button>
                    ) : null}
                    {quote.status === "sent" ? (
                      <Button variant="ghost" disabled={busy} onClick={() => quoteAction(quote.id, "accept")}>
                        Mark accepted
                      </Button>
                    ) : null}
                    {quote.status === "pending_approval" ? (
                      <>
                        <Button variant="ghost" disabled={busy} onClick={() => quoteAction(quote.id, "approve")}>
                          Approve
                        </Button>
                        <Button variant="ghost" disabled={busy} onClick={() => quoteAction(quote.id, "reject")}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
              {quotes.length === 0 ? <Empty>No quotes yet.</Empty> : null}
            </div>
            <form className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4 sm:grid-cols-2" onSubmit={createQuote}>
              <Input
                className="sm:col-span-2"
                placeholder="Quote name"
                value={quoteForm.name}
                onChange={(e) => setQuoteForm({ ...quoteForm, name: e.target.value })}
                required
              />
              <Select
                value={quoteForm.product_id}
                onChange={(e) => setQuoteForm({ ...quoteForm, product_id: e.target.value })}
                required
              >
                <option value="">Product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${p.unit_price})
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Discount %"
                value={quoteForm.discount_percent}
                onChange={(e) => setQuoteForm({ ...quoteForm, discount_percent: e.target.value })}
              />
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="Qty"
                value={quoteForm.quantity}
                onChange={(e) => setQuoteForm({ ...quoteForm, quantity: e.target.value })}
              />
              <Button type="submit" disabled={busy || products.length === 0}>
                Create quote
              </Button>
            </form>
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
                      <Link
                        href={`/tasks/${task.id}`}
                        className={`text-sm font-medium text-[var(--cyan)] hover:underline ${task.completed ? "line-through opacity-70" : ""}`}
                      >
                        {task.title}
                      </Link>
                      <p className="text-xs text-[var(--muted)]">
                        {task.due_at ? `Due ${formatDateTime(task.due_at)}` : "No due date"}
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
            <form
              className="mt-4 flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--input)]/60 p-3 sm:flex-row sm:items-end sm:gap-3"
              onSubmit={addTask}
            >
              <label className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                Task
                <Input
                  className="mt-1.5"
                  placeholder="New task title"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  required
                />
              </label>
              <DateTimeFields
                value={taskForm.due_at}
                onChange={(due_at) => setTaskForm({ ...taskForm, due_at })}
              />
              <Button type="submit" disabled={busy || !taskForm.title.trim()} className="shrink-0 sm:mb-0.5">
                Add task
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Comments</h2>
            <div className="mt-3">
              <CommentThread endpoint={`/api/opportunities/${params.id}/comments/`} refreshKey={timelineKey} />
            </div>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Send email</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Delivers via Celery with open/click tracking on the timeline.
            </p>
            <form className="mt-3 grid gap-2" onSubmit={sendEmail}>
              <Input
                type="email"
                placeholder="To"
                value={emailForm.to_email}
                onChange={(e) => setEmailForm({ ...emailForm, to_email: e.target.value })}
                required
              />
              <Input
                placeholder="Subject"
                value={emailForm.subject}
                onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                required
              />
              <Textarea
                placeholder="Body"
                rows={4}
                value={emailForm.body}
                onChange={(e) => setEmailForm({ ...emailForm, body: e.target.value })}
                required
              />
              <Button type="submit" disabled={busy}>
                Send email
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
            <div className="mt-3">
              <TimelineFeed scope={{ opportunity: Number(params.id) }} refreshKey={timelineKey} />
            </div>
          </Card>
        </div>
      </div>

      {closeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,6,20,0.78)] px-4 backdrop-blur-md"
          onClick={() => setCloseModal(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_0_0_1px_rgba(0,229,255,0.08),0_0_40px_rgba(255,43,214,0.2)]"
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
