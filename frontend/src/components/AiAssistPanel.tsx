"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import type { AiSuggestion, EmailTemplate, Opportunity } from "@/lib/types";

export function AiAssistPanel({
  opportunity,
  onOpportunityPatch,
  onEmailDraft,
}: {
  opportunity: Opportunity;
  onOpportunityPatch?: (opp: Opportunity) => void;
  onEmailDraft?: (draft: { subject: string; body: string; to_email?: string }) => void;
}) {
  const [summary, setSummary] = useState<AiSuggestion | null>(null);
  const [nextAction, setNextAction] = useState<AiSuggestion | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    apiList<AiSuggestion>(`/api/ai-suggestions/?opportunity=${opportunity.id}`)
      .then((rows) => {
        setSummary(rows.find((r) => r.kind === "summary") || null);
        setNextAction(rows.find((r) => r.kind === "next_action") || null);
      })
      .catch(() => undefined);
    apiList<EmailTemplate>("/api/email-templates/")
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [opportunity.id]);

  async function runSummary() {
    setBusy("summary");
    setError("");
    try {
      const s = await api<AiSuggestion>(`/api/opportunities/${opportunity.id}/ai-summary/`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summary failed");
    } finally {
      setBusy("");
    }
  }

  async function runNextAction(apply = false) {
    setBusy(apply ? "apply" : "nba");
    setError("");
    try {
      const res = await api<{ suggestion: AiSuggestion; opportunity: Opportunity }>(
        `/api/opportunities/${opportunity.id}/ai-next-action/`,
        { method: "POST", body: JSON.stringify({ apply }) },
      );
      setNextAction(res.suggestion);
      if (apply && onOpportunityPatch) onOpportunityPatch(res.opportunity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Next action failed");
    } finally {
      setBusy("");
    }
  }

  async function runEmailDraft() {
    setBusy("email");
    setError("");
    try {
      const templateId = templates[0]?.id;
      const s = await api<AiSuggestion>(`/api/opportunities/${opportunity.id}/ai-email-draft/`, {
        method: "POST",
        body: JSON.stringify(templateId ? { template_id: templateId } : {}),
      });
      const subject = String(s.output_json?.subject || `Follow-up: ${opportunity.name}`);
      const body = String(s.output_json?.body || s.output_text);
      const to = s.output_json?.to_email ? String(s.output_json.to_email) : undefined;
      onEmailDraft?.({ subject, body, to_email: to });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg">AI assists</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Rules-based coaching offline; optional LLM when <code className="text-xs">AI_API_KEY</code> is set.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={!!busy} onClick={runSummary}>
            {busy === "summary" ? "…" : "Summarize deal"}
          </Button>
          <Button variant="ghost" disabled={!!busy} onClick={() => runNextAction(false)}>
            {busy === "nba" ? "…" : "Suggest next step"}
          </Button>
          <Button variant="ghost" disabled={!!busy} onClick={runEmailDraft}>
            {busy === "email" ? "…" : "Draft email"}
          </Button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}

      {nextAction ? (
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--input)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--cyan)]">Suggested next step</p>
            <Badge>{nextAction.provider}</Badge>
          </div>
          <p className="mt-1 font-medium">{nextAction.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">{nextAction.output_text}</p>
          <Button
            className="mt-3"
            disabled={!!busy}
            onClick={() => runNextAction(true)}
          >
            {busy === "apply" ? "…" : "Apply to next step"}
          </Button>
        </div>
      ) : null}

      {summary ? (
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Deal summary</p>
            <Badge tone="ok">{summary.provider}</Badge>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{summary.output_text}</p>
        </div>
      ) : null}
    </Card>
  );
}
