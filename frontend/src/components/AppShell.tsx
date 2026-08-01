"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/tasks", label: "Tasks" },
  { href: "/accounts", label: "Accounts" },
  { href: "/sequences", label: "Sequences" },
  { href: "/forecast", label: "Forecast" },
  { href: "/reports", label: "Reports" },
  { href: "/jobs", label: "Jobs" },
  { href: "/settings", label: "Settings", managerOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-[var(--ink)]">
        <p className="text-sm tracking-wide text-[var(--muted)]">Loading PipelineHQ…</p>
      </div>
    );
  }

  const nav = NAV.filter((item) => !item.managerOnly || user.role === "MANAGER");

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-2 py-1 text-sm md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              Menu
            </button>
            <Link href="/dashboard" className="font-[family-name:var(--font-display)] text-xl tracking-tight">
              Pipeline<span className="text-[var(--accent)]">HQ</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <GlobalSearch />
            <NotificationBell />
            <span className="hidden sm:inline text-[var(--muted)]">
              {user.first_name || user.username} · {user.role}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-md bg-[var(--ink)] px-3 py-1.5 text-[var(--bg)]"
            >
              Log out
            </button>
          </div>
        </div>
        <nav
          className={`${open ? "flex" : "hidden"} md:flex mx-auto max-w-7xl flex-col gap-1 px-4 pb-3 sm:px-6 md:flex-row md:flex-wrap md:gap-4 md:pb-3`}
        >
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2 py-1.5 text-sm transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
