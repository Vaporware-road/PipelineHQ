"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/DateTimeFields";
import { Badge, Button, Card, Empty, Input, Money, PageHeader, Select } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import type { Opportunity, User } from "@/lib/types";

type PipelineResponse = {
  columns: Record<string, Opportunity[]>;
  stages: string[];
};

type PipelineFilters = {
  owner: string;
  amount_min: string;
  amount_max: string;
  close_from: string;
  close_to: string;
  is_stale: string;
  health: string;
  forecast_category: string;
};

const EMPTY_FILTERS: PipelineFilters = {
  owner: "",
  amount_min: "",
  amount_max: "",
  close_from: "",
  close_to: "",
  is_stale: "",
  health: "",
  forecast_category: "",
};

const STAGE_LABEL: Record<string, string> = {
  discovery: "Discovery",
  demo: "Demo",
  proposal: "Proposal",
  negotiation: "Negotiation",
};

function buildQuery(filters: PipelineFilters): string {
  const params = new URLSearchParams();
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.amount_min) params.set("amount_min", filters.amount_min);
  if (filters.amount_max) params.set("amount_max", filters.amount_max);
  if (filters.close_from) params.set("close_from", filters.close_from);
  if (filters.close_to) params.set("close_to", filters.close_to);
  if (filters.is_stale) params.set("is_stale", filters.is_stale);
  if (filters.health) params.set("health", filters.health);
  if (filters.forecast_category) params.set("forecast_category", filters.forecast_category);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default function PipelinePage() {
  const router = useRouter();
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [team, setTeam] = useState<User[]>([]);
  const [filters, setFilters] = useState<PipelineFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<PipelineFilters>(EMPTY_FILTERS);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [closeModal, setCloseModal] = useState<{
    opp: Opportunity;
    stage: "closed_won" | "closed_lost";
  } | null>(null);
  const [closeReason, setCloseReason] = useState("");

  const query = useMemo(() => buildQuery(applied), [applied]);

  async function load() {
    try {
      setData(await api<PipelineResponse>(`/api/opportunities/pipeline/${query}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    }
  }

  useEffect(() => {
    apiList<User>("/api/auth/team/")
      .then(setTeam)
      .catch(() => setTeam([]));
  }, []);

  useEffect(() => {
    load();
  }, [query]);

  async function moveStage(opp: Opportunity, stage: string) {
    if (stage === opp.stage) return;
    if (stage === "closed_won" || stage === "closed_lost") {
      setCloseModal({ opp, stage });
      setCloseReason("");
      return;
    }
    setBusyId(opp.id);
    setError("");
    setMessage("");
    try {
      await api(`/api/opportunities/${opp.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      });
      setMessage(`Moved “${opp.name}” to ${STAGE_LABEL[stage] || stage}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmClose() {
    if (!closeModal || !closeReason.trim()) {
      setError("A close reason is required.");
      return;
    }
    const { opp, stage } = closeModal;
    setBusyId(opp.id);
    setError("");
    setMessage("");
    try {
      const patch: Record<string, string> = { stage };
      if (stage === "closed_won") patch.win_reason = closeReason.trim();
      else patch.loss_reason = closeReason.trim();
      await api(`/api/opportunities/${opp.id}/`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMessage(`Closed “${opp.name}” as ${stage === "closed_won" ? "won" : "lost"}.`);
      setCloseModal(null);
      setCloseReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Open a deal for details, or change its stage with the dropdown."
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-[var(--accent-ink)]">{message}</p> : null}

      <Card className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Filters</h2>
          <Button
            variant="ghost"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setApplied(EMPTY_FILTERS);
            }}
          >
            Clear
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={filters.owner} onChange={(e) => setFilters({ ...filters, owner: e.target.value })}>
            <option value="">All owners</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({roleLabel(u.role)})
              </option>
            ))}
          </Select>
          <Select
            value={filters.forecast_category}
            onChange={(e) => setFilters({ ...filters, forecast_category: e.target.value })}
          >
            <option value="">All forecast</option>
            <option value="pipeline">Pipeline</option>
            <option value="best_case">Best case</option>
            <option value="commit">Commit</option>
          </Select>
          <Select value={filters.is_stale} onChange={(e) => setFilters({ ...filters, is_stale: e.target.value })}>
            <option value="">Stale: any</option>
            <option value="true">Stale only</option>
            <option value="false">Not stale</option>
          </Select>
          <Select value={filters.health} onChange={(e) => setFilters({ ...filters, health: e.target.value })}>
            <option value="">Health: any</option>
            <option value="healthy">Healthy</option>
            <option value="at_risk">At risk</option>
            <option value="stalled">Stalled</option>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Min $"
              value={filters.amount_min}
              onChange={(e) => setFilters({ ...filters, amount_min: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Max $"
              value={filters.amount_max}
              onChange={(e) => setFilters({ ...filters, amount_max: e.target.value })}
            />
          </div>
          <DatePicker
            mode="date"
            placeholder="Close date from"
            value={filters.close_from}
            onChange={(close_from) => setFilters({ ...filters, close_from })}
          />
          <DatePicker
            mode="date"
            placeholder="Close date to"
            value={filters.close_to}
            onChange={(close_to) => setFilters({ ...filters, close_to })}
          />
        </div>
        <div className="mt-3">
          <Button onClick={() => setApplied({ ...filters })}>Apply filters</Button>
        </div>
      </Card>

      {!data ? (
        <Empty>Loading pipeline…</Empty>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {data.stages.map((stage) => (
            <div
              key={stage}
              className="min-w-[260px] flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{STAGE_LABEL[stage] || stage}</h2>
                <Badge>{data.columns[stage]?.length || 0}</Badge>
              </div>
              <div className="space-y-2">
                {(data.columns[stage] || []).map((opp) => (
                  <Card key={opp.id} className="!p-3 shadow-none">
                    <button
                      type="button"
                      className="w-full text-left font-medium hover:text-[var(--accent)]"
                      onClick={() => router.push(`/opportunities/${opp.id}`)}
                    >
                      {opp.name}
                    </button>
                    <p className="mt-1 text-xs text-[var(--muted)]">{opp.account_name}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Money value={opp.amount} />
                      {opp.health === "stalled" ? (
                        <Badge tone="warn">stalled</Badge>
                      ) : opp.health === "at_risk" ? (
                        <Badge tone="warn">at risk</Badge>
                      ) : opp.health === "healthy" ? (
                        <Badge tone="ok">healthy</Badge>
                      ) : null}
                      {opp.is_stale ? <Badge tone="warn">stale</Badge> : null}
                    </div>
                    <label className="mt-2 block text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      Change stage
                    </label>
                    <Select
                      className="mt-1"
                      value={opp.stage}
                      disabled={busyId === opp.id}
                      onChange={(e) => moveStage(opp, e.target.value)}
                    >
                      {data.stages.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABEL[s] || s}
                        </option>
                      ))}
                      <option value="closed_won">Closed Won</option>
                      <option value="closed_lost">Closed Lost</option>
                    </Select>
                    <Button
                      className="mt-2 w-full"
                      variant="ghost"
                      disabled={busyId === opp.id}
                      onClick={() => router.push(`/opportunities/${opp.id}`)}
                    >
                      Open deal
                    </Button>
                  </Card>
                ))}
                {(data.columns[stage] || []).length === 0 ? (
                  <p className="py-6 text-center text-xs text-[var(--muted)]">Empty</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

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
              {closeModal.stage === "closed_won" ? "Close as won" : "Close as lost"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Closing “{closeModal.opp.name}” requires a reason.
            </p>
            <textarea
              className="mt-3 h-28 w-full rounded-md border border-[var(--line)] bg-[var(--input)] p-2 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--cyan)] focus:shadow-[0_0_0_1px_rgba(0,229,255,0.35)]"
              placeholder={closeModal.stage === "closed_won" ? "Win reason" : "Loss reason"}
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCloseModal(null)}>
                Cancel
              </Button>
              <Button disabled={busyId === closeModal.opp.id || !closeReason.trim()} onClick={confirmClose}>
                Confirm close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
