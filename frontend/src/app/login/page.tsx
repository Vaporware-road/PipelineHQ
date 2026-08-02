"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark, SiteFooter } from "@/components/Brand";
import { Button, Card, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ROLE_BLURBS, ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/lib/types";

const DEMO_ROLES: Role[] = ["SDR", "AE", "MANAGER"];

export default function LoginPage() {
  const { user, loading, demoLogin, loginWithPassword } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("ae");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:gap-20">
        <div className="login-hero-brand flex-1">
          <BrandMark className="text-xs sm:text-sm" />
          <p className="mt-5 text-xs uppercase tracking-[0.32em] text-[var(--cyan)]">Revenue workspace</p>
          <h1 className="synth-neon mt-4 font-[family-name:var(--font-display)] text-5xl leading-[1.05] tracking-[0.06em] sm:text-7xl">
            Pipeline
            <span className="text-[var(--accent)] drop-shadow-[0_0_18px_rgba(255,43,214,0.55)]">HQ</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            Capture leads, run deals, hit forecast — neon-lit pipeline for SaaS teams.
          </p>
          <div className="login-hero-line mt-10" aria-hidden />
        </div>

        <div className="login-hero-panel w-full max-w-md space-y-4">
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">Demo access</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Seeded password: <span className="text-[var(--cyan)]">demo1234</span>
            </p>
            <div className="mt-4 grid gap-2">
              {DEMO_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => demoLogin(role))}
                  className="group rounded-lg border border-[var(--line)] bg-[var(--input)] px-3 py-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:shadow-[0_0_20px_rgba(255,43,214,0.2)] disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--ink)] group-hover:text-[var(--accent-ink)]">
                      {busy ? "Signing in…" : `Log in as ${ROLE_LABELS[role]}`}
                    </span>
                    <span className="rounded border border-[rgba(0,229,255,0.25)] px-1.5 py-0.5 text-[10px] tracking-[0.04em] text-[var(--cyan)]">
                      {ROLE_LABELS[role]}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{ROLE_BLURBS[role]}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cyan)]">Password login</h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => loginWithPassword(username, password));
              }}
            >
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoComplete="username" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                autoComplete="current-password"
              />
              {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
              <Button type="submit" disabled={busy} className="w-full tracking-[0.08em] uppercase">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Card>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
