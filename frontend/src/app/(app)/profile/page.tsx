"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Input, PageHeader } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ROLE_BLURBS, roleLabel } from "@/lib/roles";
import type { MeSummary, NotificationItem, User } from "@/lib/types";

type ProfileForm = {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  phone: string;
};

export default function ProfilePage() {
  const { user, loading, refreshMe } = useAuth();
  const [form, setForm] = useState<ProfileForm>({
    first_name: "",
    last_name: "",
    email: "",
    title: "",
    phone: "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [error, setError] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [busyProfile, setBusyProfile] = useState(false);
  const [busyPassword, setBusyPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      title: user.title || "",
      phone: user.phone || "",
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      api<MeSummary>("/api/auth/me/summary/"),
      apiList<NotificationItem>("/api/notifications/?ordering=-created_at"),
    ])
      .then(([s, list]) => {
        if (cancelled) return;
        setSummary(s);
        setNotifications(list.slice(0, 6));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load workspace");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusyProfile(true);
    setError("");
    setProfileMsg("");
    try {
      await api<User>("/api/auth/me/", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      await refreshMe();
      setProfileMsg("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setBusyProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPasswordMsg("");
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusyPassword(true);
    try {
      await api("/api/auth/change-password/", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg("Password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setBusyPassword(false);
    }
  }

  if (loading || !user) {
    return <Empty>Loading profile…</Empty>;
  }

  const workspace = [
    { label: "Open leads", value: summary?.open_leads, href: "/leads" },
    { label: "Open opportunities", value: summary?.open_opportunities, href: "/pipeline" },
    { label: "Open tasks", value: summary?.open_tasks, href: "/tasks" },
  ];

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Your CRM identity, security, and personal workspace."
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <Card className="mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Profile</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Name, email, and contact details used across PipelineHQ.
        </p>
        <form onSubmit={saveProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">First name</span>
            <Input
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              autoComplete="given-name"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Last name</span>
            <Input
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              autoComplete="family-name"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[var(--muted)]">Email</span>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="email"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Job title</span>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Account Executive"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Phone</span>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              autoComplete="tel"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={busyProfile}>
              {busyProfile ? "Saving…" : "Save profile"}
            </Button>
            {profileMsg ? <span className="text-sm text-[var(--cyan)]">{profileMsg}</span> : null}
          </div>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Security</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Change the password for @{user.username}.</p>
        <form onSubmit={changePassword} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[var(--muted)]">Current password</span>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">New password</span>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Confirm new password</span>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={busyPassword}>
              {busyPassword ? "Updating…" : "Update password"}
            </Button>
            {passwordMsg ? <span className="text-sm text-[var(--cyan)]">{passwordMsg}</span> : null}
          </div>
        </form>
      </Card>

      <Card className="mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Role</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Assigned by a Sales Manager — read-only here. Role changes happen in{" "}
          {user.role === "MANAGER" ? (
            <Link href="/admin" className="underline">
              Admin → Team
            </Link>
          ) : (
            "Admin → Team"
          )}
          .
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="ok">{roleLabel(user.role)}</Badge>
          <span className="text-sm text-[var(--muted)]">{ROLE_BLURBS[user.role]}</span>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg">My workspace</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Items you own — not team-wide totals.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {workspace.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border border-[var(--line)] px-4 py-3 transition hover:border-[var(--cyan)] hover:bg-[rgba(0,229,255,0.06)]"
            >
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{item.label}</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl tabular-nums text-[var(--cyan)]">
                {item.value ?? "—"}
              </p>
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Notifications</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Recent alerts for your account.</p>
          </div>
          <Badge tone={(summary?.unread_notifications ?? 0) > 0 ? "warn" : "neutral"}>
            {summary?.unread_notifications ?? 0} unread
          </Badge>
        </div>
        <div className="mt-4 space-y-2">
          {notifications.length === 0 ? (
            <Empty>No notifications yet.</Empty>
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                href={n.link || "/dashboard"}
                className={`block rounded-lg border border-[var(--line)] px-3 py-2 text-sm transition hover:border-[var(--cyan)] ${
                  n.is_read ? "opacity-70" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{n.title}</span>
                  {!n.is_read ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
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
      </Card>
    </div>
  );
}
