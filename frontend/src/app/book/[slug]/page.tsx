"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/Brand";
import { Button, Card, Empty, Input, PageHeader, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Meeting } from "@/lib/types";

type BookHost = {
  username: string;
  first_name: string;
  last_name: string;
  booking_slug: string;
};

type BookSlot = { starts_at: string; ends_at: string };

function splitEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

export default function PublicBookPage() {
  const params = useParams<{ slug: string }>();
  const [host, setHost] = useState<BookHost | null>(null);
  const [slots, setSlots] = useState<BookSlot[]>([]);
  const [selected, setSelected] = useState<BookSlot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<Meeting | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 14);
    api<{ host: BookHost; slots: BookSlot[] }>(
      `/api/book/${params.slug}/?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`,
      { auth: false },
    )
      .then((data) => {
        setHost(data.host);
        setSlots(data.slots);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Booking page unavailable"));
  }, [params.slug]);

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const emails = splitEmails(email);
    if (!emails.length) {
      setError("Add at least one email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const meeting = await api<Meeting>(`/api/book/${params.slug}/`, {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          invitee_name: name,
          invitee_email: emails.join(", "),
          starts_at: selected.starts_at,
          ends_at: selected.ends_at,
          title: `Meeting with ${name}`,
          notes,
        }),
      });
      setBooked(meeting);
      setShowDetails(true);
      setSlots((prev) => prev.filter((s) => s.starts_at !== selected.starts_at));
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

  const inviteeEmails = booked ? splitEmails(booked.invitee_email) : [];

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-10 text-[var(--ink)]">
      <div className="mb-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl tracking-[0.08em]">
          Pipeline<span className="text-[var(--accent)]">HQ</span>
        </p>
        <BrandMark className="mt-1 justify-center text-[10px]" />
      </div>
      <PageHeader
        title="Book a meeting"
        subtitle={
          host
            ? `Schedule time with ${host.first_name || host.username}`
            : "Loading availability…"
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      {booked ? (
        <Card className="mb-4 !border-[var(--cyan)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--cyan)]">You&apos;re booked</p>
              <p className="text-sm text-[var(--muted)]">
                {booked.title} · {formatDateTime(booked.starts_at)}
              </p>
            </div>
            <Button
              variant={showDetails ? "primary" : "ghost"}
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? "Hide details" : "View meeting details"}
            </Button>
          </div>
          {showDetails ? (
            <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">When</p>
                <p className="mt-1">
                  {formatDateTime(booked.starts_at)} → {formatDateTime(booked.ends_at)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Host</p>
                <p className="mt-1">
                  {host?.first_name || host?.username || booked.host?.username || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Invitee</p>
                <p className="mt-1">{booked.invitee_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Email{inviteeEmails.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-1 space-y-0.5 text-[var(--cyan)]">
                  {inviteeEmails.map((addr) => (
                    <li key={addr}>{addr}</li>
                  ))}
                </ul>
              </div>
              {booked.notes ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap">{booked.notes}</p>
                </div>
              ) : null}
              <p className="text-xs text-[var(--muted)]">Status: {booked.status}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {!booked ? (
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Available times</h2>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {slots.map((s) => (
              <button
                key={s.starts_at}
                type="button"
                onClick={() => setSelected(s)}
                className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                  selected?.starts_at === s.starts_at
                    ? "border-[var(--cyan)] bg-[rgba(0,229,255,0.1)]"
                    : "border-[var(--line)] hover:border-[var(--cyan)]"
                }`}
              >
                {formatDateTime(s.starts_at)}
              </button>
            ))}
            {slots.length === 0 ? <Empty>No open slots in the next two weeks.</Empty> : null}
          </div>
          <form onSubmit={book} className="mt-4 grid gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Your name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Email(s)</span>
              <Textarea
                rows={3}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={"you@example.com\nor bulk: a@x.com, b@y.com"}
                required
              />
              <span className="mt-1 block text-xs text-[var(--muted)]">
                One email or several — separate with commas, spaces, or new lines.
              </span>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted)]">Notes (optional)</span>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What this meeting is about"
              />
            </label>
            <Button type="submit" disabled={busy || !selected}>
              {busy ? "Booking…" : "Confirm meeting"}
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
