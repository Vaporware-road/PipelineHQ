"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, apiList } from "@/lib/api";
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

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

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
        className="relative rounded-md border border-[var(--line)] px-2.5 py-1.5 text-sm"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refresh();
        }}
      >
        Alerts
        {count > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg sm:w-96">
          <div className="mb-2 flex items-center justify-between px-2 pt-1">
            <p className="text-sm font-medium">Notifications</p>
            <button type="button" className="text-xs text-[var(--accent)]" onClick={markAllRead}>
              Mark all read
            </button>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-[var(--muted)]">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link || "/dashboard"}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-2 py-2 text-sm hover:bg-[var(--accent-soft)] ${
                    n.is_read ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{n.title}</span>
                    {!n.is_read ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" /> : null}
                  </div>
                  {n.body ? <p className="mt-0.5 text-xs text-[var(--muted)]">{n.body}</p> : null}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    {n.kind} · {new Date(n.created_at).toLocaleString()}
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
