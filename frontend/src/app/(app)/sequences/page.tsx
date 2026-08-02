"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { EmailTemplate, JobRun, Lead, Sequence, SequenceEnrollment } from "@/lib/types";

export default function SequencesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedSeq, setSelectedSeq] = useState<number | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobRun | null>(null);

  const [tplForm, setTplForm] = useState({ name: "", subject: "", body: "" });
  const [seqForm, setSeqForm] = useState({ name: "", description: "" });
  const [stepForm, setStepForm] = useState({ template: "", delay_days: "0" });
  const [enrollForm, setEnrollForm] = useState({ sequence: "", lead: "" });

  async function load() {
    try {
      const [t, s, e, l] = await Promise.all([
        apiList<EmailTemplate>("/api/email-templates/"),
        apiList<Sequence>("/api/sequences/"),
        apiList<SequenceEnrollment>("/api/sequence-enrollments/"),
        apiList<Lead>("/api/leads/"),
      ]);
      setTemplates(t);
      setSequences(s);
      setEnrollments(e);
      setLeads(l.filter((lead) => lead.status !== "converted"));
      if (!selectedSeq && s.length) setSelectedSeq(s[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeSequence = sequences.find((s) => s.id === selectedSeq) || null;

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/email-templates/", { method: "POST", body: JSON.stringify(tplForm) });
      setTplForm({ name: "", subject: "", body: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template create failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(id: number) {
    setBusy(true);
    try {
      await api(`/api/email-templates/${id}/`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function createSequence(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const s = await api<Sequence>("/api/sequences/", {
        method: "POST",
        body: JSON.stringify({ name: seqForm.name, description: seqForm.description, is_active: true }),
      });
      setSeqForm({ name: "", description: "" });
      await load();
      setSelectedSeq(s.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sequence create failed");
    } finally {
      setBusy(false);
    }
  }

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSeq) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/sequences/${selectedSeq}/steps/`, {
        method: "POST",
        body: JSON.stringify({
          template: Number(stepForm.template),
          delay_days: Number(stepForm.delay_days) || 0,
          step_type: "email",
        }),
      });
      setStepForm({ template: "", delay_days: "0" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add step failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeStep(stepId: number) {
    if (!selectedSeq) return;
    setBusy(true);
    try {
      await api(`/api/sequences/${selectedSeq}/steps/${stepId}/`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove step failed");
    } finally {
      setBusy(false);
    }
  }

  async function enroll(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/sequence-enrollments/", {
        method: "POST",
        body: JSON.stringify({
          sequence: Number(enrollForm.sequence),
          lead: Number(enrollForm.lead),
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enroll failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnrollment(id: number) {
    setBusy(true);
    try {
      await api(`/api/sequence-enrollments/${id}/cancel/`, {
        method: "POST",
        body: JSON.stringify({ reason: "Cancelled from UI" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function advanceNow() {
    setBusy(true);
    setError("");
    try {
      const j = await api<JobRun>("/api/ops/advance-sequences/", { method: "POST" });
      setJob(j);
      window.setTimeout(load, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Advance failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sequences"
        subtitle="Email cadence: templates → ordered steps → enroll leads. Celery worker/beat sends mail and tracks opens/clicks. Sequences do not create CRM tasks."
        actions={
          user?.role === "MANAGER" ? (
            <Button disabled={busy} onClick={advanceNow}>
              {busy ? "Advancing…" : "Advance due steps"}
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
          <p className="mt-1 text-xs text-[var(--muted)]">
            If status stays pending, start Celery worker + beat.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">1. Templates</h2>
          <form className="mt-3 grid gap-2" onSubmit={createTemplate}>
            <Input
              placeholder="Name"
              value={tplForm.name}
              onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
              required
            />
            <Input
              placeholder="Subject (use {{name}} / {{company}})"
              value={tplForm.subject}
              onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })}
              required
            />
            <Textarea
              rows={3}
              placeholder="Body"
              value={tplForm.body}
              onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
              required
            />
            <Button type="submit" disabled={busy}>
              Add template
            </Button>
          </form>
          <div className="mt-4 space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-2 rounded-lg border border-[var(--line)] p-3">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-[var(--muted)]">{t.subject}</p>
                </div>
                <Button variant="ghost" disabled={busy} onClick={() => deleteTemplate(t.id)}>
                  Delete
                </Button>
              </div>
            ))}
            {templates.length === 0 ? <Empty>No templates yet.</Empty> : null}
          </div>
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">2. Sequences</h2>
          <form className="mt-3 grid gap-2" onSubmit={createSequence}>
            <Input
              placeholder="Sequence name"
              value={seqForm.name}
              onChange={(e) => setSeqForm({ ...seqForm, name: e.target.value })}
              required
            />
            <Textarea
              rows={2}
              placeholder="What this cadence does"
              value={seqForm.description}
              onChange={(e) => setSeqForm({ ...seqForm, description: e.target.value })}
            />
            <Button type="submit" disabled={busy}>
              Create sequence
            </Button>
          </form>
          <div className="mt-3">
            <Select
              value={selectedSeq}
              onChange={(e) => setSelectedSeq(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Pick sequence…</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.step_count} steps)
                </option>
              ))}
            </Select>
          </div>
          {activeSequence ? (
            <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{activeSequence.name}</p>
                <Badge tone={activeSequence.is_active ? "ok" : "neutral"}>
                  {activeSequence.is_active ? "active" : "off"}
                </Badge>
                <Badge>{activeSequence.enrollment_count ?? 0} enrolled</Badge>
              </div>
              {activeSequence.description ? (
                <p className="mt-1 text-sm text-[var(--muted)]">{activeSequence.description}</p>
              ) : null}
              <ol className="mt-3 space-y-2">
                {activeSequence.steps.map((st) => (
                  <li
                    key={st.id}
                    className="flex items-center justify-between gap-2 rounded border border-[var(--line)] px-2 py-1.5 text-sm"
                  >
                    <span>
                      Step {st.order} · +{st.delay_days}d · {st.step_type}: {st.template_subject}
                    </span>
                    <Button variant="ghost" disabled={busy} onClick={() => removeStep(st.id)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
              <form className="mt-3 grid gap-2" onSubmit={addStep}>
                <Select
                  value={stepForm.template}
                  onChange={(e) => setStepForm({ ...stepForm, template: e.target.value })}
                  required
                >
                  <option value="">Template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={0}
                  placeholder="Delay days"
                  value={stepForm.delay_days}
                  onChange={(e) => setStepForm({ ...stepForm, delay_days: e.target.value })}
                />
                <Button type="submit" disabled={busy} variant="ghost">
                  Add email step
                </Button>
              </form>
            </div>
          ) : null}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">3. Enrollments</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Prefer enrolling from a lead detail page. Open/click counts come from related EmailMessage rows.
          </p>
          <form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={enroll}>
            <Select
              value={enrollForm.sequence}
              onChange={(e) => setEnrollForm({ ...enrollForm, sequence: e.target.value })}
              required
            >
              <option value="">Sequence…</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              value={enrollForm.lead}
              onChange={(e) => setEnrollForm({ ...enrollForm, lead: e.target.value })}
              required
            >
              <option value="">Lead…</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.company}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={busy}>
              Enroll lead
            </Button>
          </form>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="py-2">Lead</th>
                  <th>Sequence</th>
                  <th>Status</th>
                  <th>Step</th>
                  <th>Next run</th>
                  <th>Tracking</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {enrollments.map((en) => {
                  const opens = (en.recent_messages || []).reduce((n, m) => n + (m.open_count || 0), 0);
                  const clicks = (en.recent_messages || []).reduce((n, m) => n + (m.click_count || 0), 0);
                  return (
                    <tr key={en.id} className="border-t border-[var(--line)]">
                      <td className="py-2">
                        <Link href={`/leads/${en.lead}`} className="text-[var(--cyan)] hover:underline">
                          {en.lead_name}
                        </Link>
                        <span className="block text-xs text-[var(--muted)]">{en.lead_company}</span>
                      </td>
                      <td>{en.sequence_name}</td>
                      <td>
                        <Badge tone={en.status === "active" ? "ok" : "neutral"}>{en.status}</Badge>
                      </td>
                      <td>{en.current_step_order}</td>
                      <td>{en.next_run_at ? formatDateTime(en.next_run_at) : "—"}</td>
                      <td className="text-xs text-[var(--muted)]">
                        {opens} opens · {clicks} clicks
                        <div>{en.last_message}</div>
                      </td>
                      <td>
                        {en.status === "active" ? (
                          <Button variant="ghost" disabled={busy} onClick={() => cancelEnrollment(en.id)}>
                            Cancel
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {enrollments.length === 0 ? <Empty>No enrollments yet.</Empty> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
