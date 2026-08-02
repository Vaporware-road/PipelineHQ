"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BrandMark, SiteFooter } from "@/components/Brand";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";

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
  { href: "/admin", label: "Admin", managerOnly: true },
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
      <div className="grid min-h-screen place-items-center text-[var(--ink)]">
        <div className="text-center">
          <p className="synth-neon font-[family-name:var(--font-display)] text-lg tracking-[0.12em]">
            Pipeline<span className="text-[var(--accent)]">HQ</span>
          </p>
          <div className="mt-2 flex justify-center">
            <BrandMark className="text-[10px]" />
          </div>
          <p className="mt-3 text-xs uppercase tracking-[0.28em] text-[var(--cyan)]">Loading…</p>
        </div>
      </div>
    );
  }

  const nav = NAV.filter((item) => !item.managerOnly || user.role === "MANAGER");

  return (
    <div className="flex min-h-screen flex-col text-[var(--ink)]">
      <header className="shell-chrome sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-[var(--line)] bg-[var(--input)] px-2.5 py-1.5 text-xs uppercase tracking-[0.14em] text-[var(--muted)] transition hover:border-[var(--cyan)] hover:text-[var(--cyan)] md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="Toggle navigation"
            >
              {open ? "Close" : "Menu"}
            </button>
            <div className="flex flex-col leading-none">
              <Link
                href="/dashboard"
                className="font-[family-name:var(--font-display)] text-xl tracking-[0.08em] transition hover:opacity-90"
              >
                Pipeline
                <span className="text-[var(--accent)] drop-shadow-[0_0_10px_rgba(255,43,214,0.55)]">HQ</span>
              </Link>
              <BrandMark className="mt-1 text-[9px] sm:text-[10px]" />
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-sm sm:gap-3">
            <GlobalSearch />
            <NotificationBell />
            <Link
              href="/profile"
              className="inline-flex max-w-[9.5rem] items-center gap-1.5 border-l border-[var(--line)] pl-2.5 transition hover:opacity-90 sm:max-w-none sm:pl-3"
              title="Open profile"
            >
              <span className="truncate text-[var(--muted)]">{user.first_name || user.username}</span>
              <span className="hidden text-[var(--line)] sm:inline">·</span>
              <span className="hidden rounded border border-[rgba(0,229,255,0.28)] bg-[rgba(0,229,255,0.08)] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-[var(--cyan)] sm:inline">
                {roleLabel(user.role)}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              className="rounded-md border border-[var(--cyan)] bg-transparent px-3 py-1.5 text-xs font-medium uppercase tracking-[0.1em] text-[var(--cyan)] transition hover:bg-[rgba(0,229,255,0.12)] hover:shadow-[var(--glow-cyan)]"
            >
              Log out
            </button>
          </div>
        </div>

        <nav
          className={`${open ? "flex" : "hidden"} md:flex mx-auto max-w-7xl flex-col gap-1 border-t border-[var(--line)] px-4 py-2.5 sm:px-6 md:flex-row md:flex-wrap md:items-center md:gap-1.5`}
        >
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2.5 py-1.5 text-sm tracking-wide transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--accent-ink)] shadow-[0_0_18px_rgba(255,43,214,0.22)] ring-1 ring-[rgba(255,43,214,0.35)]"
                    : "text-[var(--muted)] hover:bg-[rgba(0,229,255,0.06)] hover:text-[var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="shell-chrome-line" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
