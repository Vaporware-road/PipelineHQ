"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { EmailTemplate, JobRun, Lead, Sequence, SequenceEnrollment } from "@/lib/types";

export default function SequencesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobRun | null>(null);

  const [tplForm, setTplForm] = useState({ name: "", subject: "", body: "" });
  const [seqName, setSeqName] = useState("");
  const [stepForm, setStepForm] = useState({ sequence: "", template: "", delay_days: "0" });
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    load();
  }, []);

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

  async function createSequence(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/sequences/", {
        method: "POST",
        body: JSON.stringify({ name: seqName, is_active: true }),
      });
      setSeqName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sequence create failed");
    } finally {
      setBusy(false);
    }
  }

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    if (!stepForm.sequence) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/sequences/${stepForm.sequence}/steps/`, {
        method: "POST",
        body: JSON.stringify({
          template: Number(stepForm.template),
          delay_days: Number(stepForm.delay_days) || 0,
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add step failed");
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
        subtitle="Lightweight email cadences — steps create tasks + notifications (console email)."
        actions={
          user?.role === "MANAGER" ? (
            <Button disabled={busy} onClick={advanceNow}>
              Advance due steps
            </Button>
          ) : undefined
        }
      />
      {error ? <p className="mb-3 text-sm text-[#b42318]">{error}</p> : null}
      {job ? (
        <Card className="mb-4">
          <p className="text-sm">
            Job #{job.id} · {job.type} · <strong>{job.status}</strong> — {job.message}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Templates</h2>
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
              <div key={t.id} className="rounded-lg border border-[var(--line)] p-3">
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-[var(--muted)]">{t.subject}</p>
              </div>
            ))}
            {templates.length === 0 ? <Empty>No templates yet.</Empty> : null}
          </div>
        </Card>

        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Sequences</h2>
          <form className="mt-3 flex gap-2" onSubmit={createSequence}>
            <Input
              placeholder="Sequence name"
              value={seqName}
              onChange={(e) => setSeqName(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              Create
            </Button>
          </form>
          <form className="mt-3 grid gap-2" onSubmit={addStep}>
            <Select
              value={stepForm.sequence}
              onChange={(e) => setStepForm({ ...stepForm, sequence: e.target.value })}
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
              placeholder="Delay days before this step"
              value={stepForm.delay_days}
              onChange={(e) => setStepForm({ ...stepForm, delay_days: e.target.value })}
            />
            <Button type="submit" disabled={busy} variant="ghost">
              Add step
            </Button>
          </form>
          <div className="mt-4 space-y-3">
            {sequences.map((s) => (
              <div key={s.id} className="rounded-lg border border-[var(--line)] p-3">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{s.name}</p>
                  <Badge tone={s.is_active ? "ok" : "neutral"}>{s.is_active ? "active" : "off"}</Badge>
                  <Badge>{s.step_count} steps</Badge>
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
                  {s.steps.map((st) => (
                    <li key={st.id}>
                      Day +{st.delay_days}: {st.template_subject}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {sequences.length === 0 ? <Empty>No sequences yet.</Empty> : null}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Enrollments</h2>
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
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((en) => (
                  <tr key={en.id} className="border-t border-[var(--line)]">
                    <td className="py-2">
                      {en.lead_name}
                      <span className="block text-xs text-[var(--muted)]">{en.lead_company}</span>
                    </td>
                    <td>{en.sequence_name}</td>
                    <td>
                      <Badge tone={en.status === "active" ? "ok" : "neutral"}>{en.status}</Badge>
                    </td>
                    <td>{en.current_step_order}</td>
                    <td>{en.next_run_at ? new Date(en.next_run_at).toLocaleString() : "—"}</td>
                    <td className="text-[var(--muted)]">{en.last_message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {enrollments.length === 0 ? <Empty>No enrollments yet.</Empty> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
