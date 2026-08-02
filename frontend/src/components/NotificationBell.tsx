"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useRealtime, type RealtimeMessage } from "@/lib/realtime";
import type { NotificationItem } from "@/lib/types";

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [list, unread] = await Promise.all([
        apiList<NotificationItem>("/api/notifications/?ordering=-created_at"),
        api<{ count: number }>("/api/notifications/unread-count/"),
      ]);
      setItems(list.slice(0, 8));
      setCount(unread.count);
    } catch {
      /* keep last good state while offline */
    }
  }, []);

  const { connected } = useRealtime(
    useCallback((msg: RealtimeMessage) => {
      if (msg.event !== "notification") return;
      const n = msg.payload as unknown as NotificationItem;
      if (!n?.id) return;
      setItems((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n, ...prev].slice(0, 8);
      });
      if (!n.is_read) setCount((c) => c + 1);
    }, []),
  );

  useEffect(() => {
    refresh();
    // Slow poll when live; faster fallback when WS is down.
    const ms = connected ? 60_000 : 20_000;
    const id = window.setInterval(refresh, ms);
    return () => window.clearInterval(id);
  }, [refresh, connected]);

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length && count === 0) return;
    try {
      await api("/api/notifications/mark-read/", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative rounded-md border border-[var(--line)] px-2.5 py-1.5 text-sm text-[var(--muted)] transition hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refresh();
        }}
      >
        Alerts
        {count > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white shadow-[0_0_12px_rgba(255,43,214,0.55)]">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_0_0_1px_rgba(0,229,255,0.08),0_0_36px_rgba(255,43,214,0.2)] sm:w-96">
          <div className="mb-0 flex items-center justify-between border-b border-[var(--line)] bg-[var(--input)] px-3 py-2.5">
            <p className="font-[family-name:var(--font-display)] text-sm tracking-[0.06em]">
              Notifications
              <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                {connected ? "live" : "polling"}
              </span>
            </p>
            <button
              type="button"
              className="text-xs uppercase tracking-[0.1em] text-[var(--cyan)] transition hover:text-[var(--accent)]"
              onClick={markAllRead}
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto p-2">
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-[var(--muted)]">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link || "/dashboard"}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-2 py-2 text-sm transition hover:bg-[var(--accent-soft)] ${
                    n.is_read ? "opacity-70" : "ring-1 ring-[rgba(255,43,214,0.15)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-[var(--ink)]">{n.title}</span>
                    {!n.is_read ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(255,43,214,0.7)]" />
                    ) : null}
                  </div>
                  {n.body ? <p className="mt-0.5 text-xs text-[var(--muted)]">{n.body}</p> : null}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    {n.kind} · {formatDateTime(n.created_at)}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
