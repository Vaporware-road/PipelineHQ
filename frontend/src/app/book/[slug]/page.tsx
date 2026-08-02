"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/Brand";
import { Button, Card, Empty, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type BookHost = {
  username: string;
  first_name: string;
  last_name: string;
  booking_slug: string;
};

type BookSlot = { starts_at: string; ends_at: string };

export default function PublicBookPage() {
  const params = useParams<{ slug: string }>();
  const [host, setHost] = useState<BookHost | null>(null);
  const [slots, setSlots] = useState<BookSlot[]>([]);
  const [selected, setSelected] = useState<BookSlot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
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
    setBusy(true);
    setError("");
    try {
      await api(`/api/book/${params.slug}/`, {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          invitee_name: name,
          invitee_email: email,
          starts_at: selected.starts_at,
          ends_at: selected.ends_at,
          title: `Meeting with ${name}`,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }

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
      {done ? (
        <Card>
          <p className="text-[var(--cyan)]">You&apos;re booked.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {selected ? formatDateTime(selected.starts_at) : null} — we notified the host.
          </p>
        </Card>
      ) : (
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
              <span className="mb-1 block text-[var(--muted)]">Email</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <Button type="submit" disabled={busy || !selected}>
              {busy ? "Booking…" : "Confirm meeting"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
