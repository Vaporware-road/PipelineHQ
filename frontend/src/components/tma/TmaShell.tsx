"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, Card } from "@/components/ui";
import { useTmaAuth } from "@/lib/tma-auth";

const TABS = [
  { href: "/tma", label: "Home", match: (p: string) => p === "/tma" },
  { href: "/tma/leads", label: "Leads", match: (p: string) => p.startsWith("/tma/leads") },
  { href: "/tma/pipeline", label: "Pipeline", match: (p: string) => p.startsWith("/tma/pipeline") || p.startsWith("/tma/opportunities") },
  { href: "/tma/schedule", label: "Schedule", match: (p: string) => p.startsWith("/tma/schedule") },
  { href: "/tma/clients", label: "Clients", match: (p: string) => p.startsWith("/tma/clients") },
] as const;

function BootScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <p className="text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}

export function TmaShell({ children }: { children: ReactNode }) {
  const { phase, retry, unlinkAccount } = useTmaAuth();
  const pathname = usePathname();
  const onLink = pathname === "/tma/link";
  const showTabs = phase.kind === "ready" && !onLink;
  const [unlinking, setUnlinking] = useState(false);

  async function onUnlink() {
    if (unlinking) return;
    setUnlinking(true);
    try {
      await unlinkAccount();
    } catch {
      /* keep session; error surfaces on next boot if needed */
    } finally {
      setUnlinking(false);
    }
  }

  let body: ReactNode;
  switch (phase.kind) {
    case "booting":
      body = <BootScreen message="Connecting to PipelineHQ…" />;
      break;
    case "error":
      body = (
        <div className="mx-auto max-w-md px-4 py-10">
          <Card>
            <h1 className="font-[family-name:var(--font-display)] text-lg tracking-[0.06em]">
              Mini App
            </h1>
            <p className="mt-2 text-sm text-[var(--danger)]">{phase.message}</p>
            <Button className="mt-4 w-full" onClick={retry}>
              Retry
            </Button>
          </Card>
        </div>
      );
      break;
    case "needs_link":
      body = onLink ? children : <BootScreen message="Redirecting to link…" />;
      break;
    case "ready":
      body = children;
      break;
    default: {
      const _exhaustive: never = phase;
      body = _exhaustive;
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgba(11,6,20,0.92)] px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-[family-name:var(--font-display)] text-sm tracking-[0.12em] text-[var(--ink)]">
              Pipeline<span className="text-[var(--accent)]">HQ</span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--cyan)]">Mini App</p>
          </div>
          {phase.kind === "ready" ? (
            <div className="flex min-w-0 flex-col items-end gap-0.5">
              <p className="truncate text-xs text-[var(--muted)]">
                {phase.user.first_name || phase.user.username}
              </p>
              <button
                type="button"
                onClick={onUnlink}
                disabled={unlinking}
                className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-50"
              >
                {unlinking ? "Unlinking…" : "Unlink"}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className={`flex-1 px-4 py-4 ${showTabs ? "pb-24" : "pb-8"}`}>{body}</main>

      {showTabs ? (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[rgba(11,6,20,0.96)] backdrop-blur">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {TABS.map((tab) => {
              const active = tab.match(pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex flex-col items-center gap-0.5 px-1 py-2.5 text-[11px] transition ${
                    active
                      ? "text-[var(--accent)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  <span
                    className={`h-1 w-1 rounded-full ${active ? "bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" : "bg-transparent"}`}
                    aria-hidden
                  />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
