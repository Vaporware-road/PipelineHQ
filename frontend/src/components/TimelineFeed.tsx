"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Empty } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { TimelineEvent } from "@/lib/types";

type TimelineScope =
  | { account: number }
  | { contact: number }
  | { lead: number }
  | { opportunity: number };

export function TimelineFeed({
  scope,
  refreshKey = 0,
}: {
  scope: TimelineScope;
  refreshKey?: number;
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if ("account" in scope) params.set("account", String(scope.account));
    if ("contact" in scope) params.set("contact", String(scope.contact));
    if ("lead" in scope) params.set("lead", String(scope.lead));
    if ("opportunity" in scope) params.set("opportunity", String(scope.opportunity));
    setLoading(true);
    api<{ results: TimelineEvent[] }>(`/api/timeline/?${params}`)
      .then((data) => {
        setEvents(data.results || []);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load timeline"))
      .finally(() => setLoading(false));
  }, [
    "account" in scope ? scope.account : 0,
    "contact" in scope ? scope.contact : 0,
    "lead" in scope ? scope.lead : 0,
    "opportunity" in scope ? scope.opportunity : 0,
    refreshKey,
  ]);

  if (loading) return <Empty>Loading timeline…</Empty>;
  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (events.length === 0) return <Empty>No timeline events yet.</Empty>;

  return (
    <div className="space-y-3">
      {events.map((ev) => (
        <div key={ev.id} className="border-l-2 border-[var(--accent)] pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{ev.event_type.replace(/_/g, " ")}</Badge>
            {ev.href ? (
              <Link href={ev.href} className="font-medium hover:text-[var(--cyan)]">
                {ev.title}
              </Link>
            ) : (
              <span className="font-medium">{ev.title}</span>
            )}
            <span className="text-xs text-[var(--muted)]">
              {formatDateTime(ev.occurred_at)}
              {ev.actor ? ` · ${ev.actor.username}` : ""}
            </span>
          </div>
          {ev.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">{ev.body}</p> : null}
        </div>
      ))}
    </div>
  );
}
