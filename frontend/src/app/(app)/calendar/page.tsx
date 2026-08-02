"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TimePicker } from "@/components/DateTimeFields";
import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { AvailabilitySlot, Meeting } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [slotForm, setSlotForm] = useState({ weekday: "0", start_time: "09:00", end_time: "09:30" });

  const weekEnd = useMemo(() => addDays(anchor, 7), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);

  async function load() {
    try {
      const [m, s] = await Promise.all([
        apiList<Meeting>(
          `/api/meetings/?ordering=starts_at&starts_at_after=${anchor.toISOString()}`,
        ).catch(() => apiList<Meeting>("/api/meetings/?ordering=starts_at")),
        apiList<AvailabilitySlot>("/api/availability/"),
      ]);
      setMeetings(
        m.filter((x) => {
          const t = new Date(x.starts_at).getTime();
          return t >= anchor.getTime() && t < weekEnd.getTime();
        }),
      );
      setSlots(s);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calendar");
    }
  }

  useEffect(() => {
    load();
  }, [anchor.getTime()]);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/availability/", {
        method: "POST",
        body: JSON.stringify({
          weekday: Number(slotForm.weekday),
          start_time: slotForm.start_time.length === 5 ? `${slotForm.start_time}:00` : slotForm.start_time,
          end_time: slotForm.end_time.length === 5 ? `${slotForm.end_time}:00` : slotForm.end_time,
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add slot");
    } finally {
      setBusy(false);
    }
  }

  async function removeSlot(id: number) {
    setBusy(true);
    try {
      await api(`/api/availability/${id}/`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove slot");
    } finally {
      setBusy(false);
    }
  }

  const bookingUrl =
    typeof window !== "undefined" && user?.booking_slug
      ? `${window.location.origin}/book/${user.booking_slug}`
      : user?.booking_slug
        ? `/book/${user.booking_slug}`
        : "";

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Your meetings this week and booking availability."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setAnchor(addDays(anchor, -7))}>
              Prev
            </Button>
            <Button variant="ghost" onClick={() => setAnchor(startOfWeek(new Date()))}>
              Today
            </Button>
            <Button variant="ghost" onClick={() => setAnchor(addDays(anchor, 7))}>
              Next
            </Button>
          </div>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mb-4 grid gap-2 sm:grid-cols-7">
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayMeetings = meetings.filter((m) => m.starts_at.slice(0, 10) === key);
          return (
            <Card key={key} className="min-h-40 !p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                {WEEKDAYS[day.getDay() === 0 ? 6 : day.getDay() - 1]} {day.getMonth() + 1}/{day.getDate()}
              </p>
              <div className="mt-2 space-y-2">
                {dayMeetings.map((m) => (
                  <div key={m.id} className="rounded border border-[var(--line)] bg-[var(--input)] px-2 py-1.5 text-xs">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-[var(--muted)]">{formatDateTime(m.starts_at)}</p>
                    <p className="text-[var(--cyan)]">{m.invitee_name}</p>
                    {m.opportunity ? (
                      <Link href={`/opportunities/${m.opportunity}`} className="underline">
                        Deal
                      </Link>
                    ) : null}
                  </div>
                ))}
                {dayMeetings.length === 0 ? <p className="text-xs text-[var(--muted)]">—</p> : null}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mb-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Booking link</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Set a booking slug on your{" "}
          <Link href="/profile" className="underline">
            profile
          </Link>
          , then share this public page.
        </p>
        {bookingUrl ? (
          <p className="mt-3 break-all font-mono text-sm text-[var(--cyan)]">{bookingUrl}</p>
        ) : (
          <Empty>Add a booking slug on Profile to enable public booking.</Empty>
        )}
      </Card>

      <Card>
        <h2 className="font-[family-name:var(--font-display)] text-lg">Availability</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Weekly slots prospects can book.</p>
        <form onSubmit={addSlot} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted)]">Day</span>
            <select
              className="rounded-md border border-[var(--line)] bg-[var(--input)] px-3 py-2 text-sm"
              value={slotForm.weekday}
              onChange={(e) => setSlotForm({ ...slotForm, weekday: e.target.value })}
            >
              {WEEKDAYS.map((label, i) => (
                <option key={label} value={String(i)}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <TimePicker
            label="Start"
            value={slotForm.start_time}
            onChange={(start_time) => setSlotForm({ ...slotForm, start_time })}
            className="w-36"
          />
          <TimePicker
            label="End"
            value={slotForm.end_time}
            onChange={(end_time) => setSlotForm({ ...slotForm, end_time })}
            className="w-36"
          />
          <Button type="submit" disabled={busy}>
            Add slot
          </Button>
        </form>
        <div className="mt-4 space-y-2">
          {slots.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
            >
              <span>
                <Badge>{WEEKDAYS[s.weekday]}</Badge> {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
              </span>
              <Button variant="ghost" disabled={busy} onClick={() => removeSlot(s.id)}>
                Remove
              </Button>
            </div>
          ))}
          {slots.length === 0 ? <Empty>No availability yet.</Empty> : null}
        </div>
      </Card>
    </div>
  );
}
