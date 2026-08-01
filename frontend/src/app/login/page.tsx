"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

const DEMOS: { role: Role; label: string; blurb: string }[] = [
  { role: "SDR", label: "Log in as SDR", blurb: "Qualify leads and convert to deals" },
  { role: "AE", label: "Log in as AE", blurb: "Own pipeline and log activities" },
  { role: "MANAGER", label: "Log in as Manager", blurb: "Forecast, ops jobs, team view" },
];

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
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-4 py-10 sm:px-6 lg:flex-row lg:items-center">
      <div className="flex-1">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--muted)]">Revenue workspace</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-5xl leading-tight tracking-tight sm:text-6xl">
          Pipeline<span className="text-[var(--accent)]">HQ</span>
        </h1>
        <p className="mt-4 max-w-md text-[var(--muted)]">
          B2B sales CRM for SaaS teams — capture leads, run deals, hit forecast.
        </p>
      </div>

      <div className="w-full max-w-md space-y-4">
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-xl">Demo access</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Password for seeded users: demo1234</p>
          <div className="mt-4 grid gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.role}
                type="button"
                disabled={busy}
                onClick={() => run(() => demoLogin(d.role))}
                className="rounded-lg border border-[var(--line)] px-3 py-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                <div className="text-sm font-semibold">{d.label}</div>
                <div className="text-xs text-[var(--muted)]">{d.blurb}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Password login</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => loginWithPassword(username, password));
            }}
          >
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
            />
            {error ? <p className="text-sm text-[#b42318]">{error}</p> : null}
            <Button type="submit" disabled={busy} className="w-full">
              Sign in
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
