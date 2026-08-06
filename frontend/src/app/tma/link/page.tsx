"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, Input } from "@/components/ui";
import { useTmaAuth } from "@/lib/tma-auth";

export default function TmaLinkPage() {
  const { phase, linkAccount } = useTmaAuth();
  // Demo seed users (seed_demo); fine for local Mini App testing.
  const [username, setUsername] = useState("ae");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const telegramUser = phase.kind === "needs_link" ? phase.telegramUser : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await linkAccount(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pt-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          Link account
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sign in once with your PipelineHQ credentials to bind this Telegram user.
        </p>
      </div>

      {telegramUser ? (
        <Card>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--cyan)]">Telegram</p>
          <p className="mt-1 text-sm text-[var(--ink)]">
            {telegramUser.first_name || "User"}
            {telegramUser.username ? (
              <span className="text-[var(--muted)]"> @{telegramUser.username}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">id {telegramUser.id}</p>
        </Card>
      ) : null}

      <Card>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="username"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete="current-password"
            required
          />
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || phase.kind === "booting"}>
            {busy ? "Linking…" : "Link & continue"}
          </Button>
        </form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Demo users: <span className="text-[var(--cyan)]">ae / sdr / manager</span> · password{" "}
          <span className="text-[var(--cyan)]">demo1234</span>
        </p>
      </Card>
    </div>
  );
}
