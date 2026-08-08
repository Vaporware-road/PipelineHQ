"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Empty, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useTmaAuth } from "@/lib/tma-auth";
import { MEETING_STATUSES } from "@/lib/tma-constants";
import type { Meeting } from "@/lib/types";

export default function TmaMeetingDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { phase } = useTmaAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const row = await api<Meeting>(`/api/meetings/${id}/`);
        if (!cancelled) {
          setMeeting(row);
          setStatus(row.status);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load meeting");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, id]);

  async function patchStatus(nextStatus: string) {
    if (!meeting || nextStatus === meeting.status) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await api<Meeting>(`/api/meetings/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setMeeting(updated);
      setStatus(updated.status);
      setMessage("Status updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !meeting) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!meeting) return <Empty>Loading meeting…</Empty>;

  return (
    <div className="space-y-4">
      <Link href="/tma/schedule" className="text-xs text-[var(--cyan)] hover:underline">
        ← Schedule
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          {meeting.title}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{formatDateTime(meeting.starts_at)}</p>
      </div>

      <Card className="space-y-2 text-sm">
        <p>
          <span className="text-[var(--muted)]">Ends</span> {formatDateTime(meeting.ends_at)}
        </p>
        <p>
          <span className="text-[var(--muted)]">Invitee</span> {meeting.invitee_name || "—"}
        </p>
        <p>
          <span className="text-[var(--muted)]">Email</span> {meeting.invitee_email || "—"}
        </p>
        {meeting.job_detail ? (
          <p className="border-t border-[var(--line)] pt-2 text-[var(--muted)]">{meeting.job_detail}</p>
        ) : null}
        {meeting.notes ? <p className="text-[var(--muted)]">{meeting.notes}</p> : null}
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">Status</p>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
          {MEETING_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            disabled={busy || meeting.status === "completed"}
            onClick={() => patchStatus("completed")}
          >
            Complete
          </Button>
          <Button
            variant="danger"
            disabled={busy || meeting.status === "cancelled"}
            onClick={() => patchStatus("cancelled")}
          >
            Cancel
          </Button>
        </div>
        <Button
          className="w-full"
          disabled={busy || status === meeting.status}
          onClick={() => patchStatus(status)}
        >
          {busy ? "Saving…" : "Save status"}
        </Button>
        {message ? <p className="text-sm text-[var(--cyan)]">{message}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>
    </div>
  );
}
