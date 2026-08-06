"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, Empty } from "@/components/ui";
import { apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useTmaAuth } from "@/lib/tma-auth";
import { labelFor, MEETING_STATUSES } from "@/lib/tma-constants";
import type { Meeting } from "@/lib/types";

export default function TmaSchedulePage() {
  const { phase } = useTmaAuth();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const from = new Date(now);
        from.setDate(from.getDate() - 1);
        const to = new Date(now);
        to.setDate(to.getDate() + 21);
        const qs = new URLSearchParams({
          ordering: "starts_at",
          starts_at_after: from.toISOString(),
          starts_at_before: to.toISOString(),
        });
        const rows = await apiList<Meeting>(`/api/meetings/?${qs.toString()}`);
        if (!cancelled) setMeetings(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load schedule");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (meetings === null) return <Empty>Loading schedule…</Empty>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          Schedule
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Upcoming meetings (±3 weeks).</p>
      </div>
      {meetings.length === 0 ? (
        <Empty>No meetings in range.</Empty>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`/tma/schedule/${m.id}`}>
                <Card className="transition hover:border-[var(--accent)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.title}</p>
                      <p className="text-xs text-[var(--muted)]">{formatDateTime(m.starts_at)}</p>
                    </div>
                    <Badge
                      tone={
                        m.status === "completed"
                          ? "ok"
                          : m.status === "cancelled"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {labelFor(MEETING_STATUSES, m.status)}
                    </Badge>
                  </div>
                  {m.invitee_name ? (
                    <p className="mt-2 truncate text-xs text-[var(--muted)]">{m.invitee_name}</p>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
