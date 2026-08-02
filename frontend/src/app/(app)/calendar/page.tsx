"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CommentThread } from "@/components/CommentThread";
import { DatePicker, TimePicker } from "@/components/DateTimeFields";
import { Badge, Button, Card, Empty, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import type { AvailabilitySlot, Meeting, Role } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type TargetRoleChoice = Role | "ALL" | "";

type DetailDraft = {
  title: string;
  job_detail: string;
  target_role: string;
  invitee_name: string;
  invitee_email: string;
  notes: string;
  status: string;
  starts_at: string;
  ends_at: string;
};

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function targetRoleLabel(role: string): string {
  if (role === "ALL") return "All roles";
  return roleLabel(role);
}

/** Blank target_role is treated as ALL for filter matching. */
function meetingTargetRole(m: Meeting): string {
  return m.target_role || "ALL";
}

function dayLaneWidth(count: number): string {
  if (count <= 2) return "9.5rem";
  const cols = Math.ceil(count / 2);
  return `calc(${cols} * 9.5rem + ${(cols - 1) * 0.5}rem + 1.5rem)`;
}

function draftFromMeeting(m: Meeting): DetailDraft {
  return {
    title: m.title || "",
    job_detail: m.job_detail || "",
    target_role: m.target_role || "",
    invitee_name: m.invitee_name || "",
    invitee_email: m.invitee_email || "",
    notes: m.notes || "",
    status: m.status || "scheduled",
    starts_at: m.starts_at || "",
    ends_at: m.ends_at || "",
  };
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const isManager = user?.role === "MANAGER";
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveOk, setSaveOk] = useState("");
  const [view, setView] = useState<"all" | "role">("all");
  const [roleFilter, setRoleFilter] = useState<TargetRoleChoice>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DetailDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [createdNotice, setCreatedNotice] = useState<Meeting | null>(null);
  const [slotForm, setSlotForm] = useState({ weekday: "0", start_time: "09:00", end_time: "09:30" });
  const [createForm, setCreateForm] = useState({
    title: "Meeting",
    invitee_name: "",
    invitee_email: "",
    starts_at: "",
    ends_at: "",
    job_detail: "",
    target_role: "" as TargetRoleChoice,
    notes: "",
  });

  const weekEnd = useMemo(() => addDays(anchor, 7), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);
  const selected = useMemo(
    () => (selectedId == null ? null : meetings.find((m) => m.id === selectedId) || null),
    [meetings, selectedId],
  );

  /**
   * Filter in the UI only. Never refetch on filter clicks — that raced and wiped
   * the week list, which also broke day expand / horizontal scroll.
   */
  const visibleMeetings = useMemo(() => {
    if (!isManager || view !== "role" || !roleFilter) return meetings;
    if (roleFilter === "ALL") {
      return meetings.filter((m) => meetingTargetRole(m) === "ALL");
    }
    return meetings.filter((m) => {
      const role = meetingTargetRole(m);
      return role === roleFilter || role === "ALL";
    });
  }, [meetings, isManager, view, roleFilter]);

  async function load(signal?: { cancelled: boolean }) {
    try {
      const params = new URLSearchParams({
        ordering: "starts_at",
        starts_at_after: anchor.toISOString(),
        starts_at_before: weekEnd.toISOString(),
      });
      // Full week always; role chips filter via visibleMeetings.
      const [m, s] = await Promise.all([
        apiList<Meeting>(`/api/meetings/?${params}`),
        apiList<AvailabilitySlot>("/api/availability/"),
      ]);
      if (signal?.cancelled) return;
      setMeetings(Array.isArray(m) ? m : []);
      setSlots(Array.isArray(s) ? s : []);
      setError("");
    } catch (e) {
      if (signal?.cancelled) return;
      setError(e instanceof Error ? e.message : "Failed to load calendar");
    }
  }

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
    // Do not depend on view / roleFilter — filters are client-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, weekEnd, user?.id, isManager]);

  function setAllMeetingsView() {
    setView("all");
    setRoleFilter("");
  }

  function setByRoleView() {
    setView("role");
    setRoleFilter((prev) => prev || "SDR");
  }

  async function cancelMeeting(meetingId: number) {
    if (!isManager) return;
    setBusy(true);
    setError("");
    setSaveOk("");
    try {
      const updated = await api<Meeting>(`/api/meetings/${meetingId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      if (selectedId === meetingId) {
        setDraft(draftFromMeeting(updated));
        setDirty(false);
      }
      setSaveOk("Meeting canceled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleMeeting(meetingId: number) {
    if (!isManager || !draft) return;
    if (!draft.starts_at || !draft.ends_at) {
      setError("Set new start and end times to reschedule.");
      return;
    }
    if (new Date(draft.ends_at) <= new Date(draft.starts_at)) {
      setError("End time must be after start time.");
      return;
    }
    setBusy(true);
    setError("");
    setSaveOk("");
    try {
      const updated = await api<Meeting>(`/api/meetings/${meetingId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "scheduled",
          starts_at: draft.starts_at,
          ends_at: draft.ends_at,
          title: draft.title,
          job_detail: draft.job_detail,
          target_role: draft.target_role || "",
          invitee_name: draft.invitee_name,
          invitee_email: draft.invitee_email,
          notes: draft.notes,
        }),
      });
      setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setDraft(draftFromMeeting(updated));
      setDirty(false);
      setSaveOk("Meeting rescheduled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reschedule failed");
    } finally {
      setBusy(false);
    }
  }

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

  async function createMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!isManager) return;
    setBusy(true);
    setError("");
    setSaveOk("");
    try {
      const meeting = await api<Meeting>("/api/meetings/", {
        method: "POST",
        body: JSON.stringify({
          title: createForm.title,
          invitee_name: createForm.invitee_name,
          invitee_email: createForm.invitee_email,
          starts_at: createForm.starts_at,
          ends_at: createForm.ends_at,
          job_detail: createForm.job_detail,
          target_role: createForm.target_role || "",
          notes: createForm.notes,
        }),
      });
      setSelectedId(meeting.id);
      setDraft(draftFromMeeting(meeting));
      setDirty(false);
      setCreatedNotice(meeting);
      setCreateForm({
        title: "Meeting",
        invitee_name: "",
        invitee_email: "",
        starts_at: "",
        ends_at: "",
        job_detail: "",
        target_role: "",
        notes: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create meeting failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isManager || selectedId == null || !draft) return;
    setBusy(true);
    setError("");
    setSaveOk("");
    try {
      const updated = await api<Meeting>(`/api/meetings/${selectedId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title,
          job_detail: draft.job_detail,
          target_role: draft.target_role || "",
          invitee_name: draft.invitee_name,
          invitee_email: draft.invitee_email,
          notes: draft.notes,
          status: draft.status,
          starts_at: draft.starts_at,
          ends_at: draft.ends_at,
        }),
      });
      setDraft(draftFromMeeting(updated));
      setDirty(false);
      setSaveOk("Meeting details saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function openDetails(meeting: Meeting) {
    setSelectedId(meeting.id);
    setDraft(draftFromMeeting(meeting));
    setDirty(false);
    setSaveOk("");
    setCreatedNotice(null);
  }

  function closeDetails() {
    setSelectedId(null);
    setDraft(null);
    setDirty(false);
    setSaveOk("");
  }

  function patchDraft(patch: Partial<DetailDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setSaveOk("");
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
        subtitle={
          isManager
            ? "Managers schedule meetings. Team members only see meetings targeted to them."
            : "You only see meetings that include your role (or All roles)."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isManager ? (
              <>
                <Button variant={view === "all" ? "primary" : "ghost"} onClick={setAllMeetingsView}>
                  All meetings
                </Button>
                <Button variant={view === "role" ? "primary" : "ghost"} onClick={setByRoleView}>
                  By role
                </Button>
              </>
            ) : null}
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
      {isManager && view === "role" ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {(["SDR", "AE", "MANAGER", "ALL"] as const).map((r) => (
            <Button key={r} variant={roleFilter === r ? "primary" : "ghost"} onClick={() => setRoleFilter(r)}>
              {targetRoleLabel(r)}
            </Button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {saveOk ? <p className="mb-3 text-sm text-[var(--cyan)]">{saveOk}</p> : null}
      {createdNotice ? (
        <Card className="mb-4 !border-[var(--cyan)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Meeting scheduled</p>
              <p className="text-sm text-[var(--muted)]">
                {createdNotice.title} · {formatDateTime(createdNotice.starts_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => openDetails(createdNotice)}>View meeting details</Button>
              <Button variant="ghost" onClick={() => setCreatedNotice(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="cal-week-scroll">
        {days.map((day) => {
          const key = dateKey(day);
          const isTodayColumn = key === dateKey(new Date());
          const dayMeetings = visibleMeetings.filter((m) => localDayKey(m.starts_at) === key);
          const overflow = dayMeetings.length > 2;
          const laneWidth = dayLaneWidth(dayMeetings.length);
          return (
            <Card
              key={key}
              className={`cal-day-lane min-h-40 !p-3 ${overflow ? "cal-day-lane--wide" : ""} ${
                isTodayColumn
                  ? "!border-[rgba(0,229,255,0.35)] shadow-[0_0_20px_rgba(0,229,255,0.12)]"
                  : ""
              }`}
              style={{
                flex: `0 0 ${laneWidth}`,
                width: laneWidth,
                minWidth: laneWidth,
              }}
            >
              <p
                className={`text-xs uppercase tracking-[0.14em] ${
                  isTodayColumn
                    ? "font-[family-name:var(--font-display)] text-[var(--cyan)] [text-shadow:0_0_10px_rgba(0,229,255,0.55)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {WEEKDAYS[day.getDay() === 0 ? 6 : day.getDay() - 1]} {day.getMonth() + 1}/{day.getDate()}
                {isTodayColumn ? " · Today" : ""}
                {dayMeetings.length > 0 ? (
                  <span className="ml-1 text-[var(--muted)] normal-case tracking-normal">
                    ({dayMeetings.length})
                  </span>
                ) : null}
              </p>
              <div className={`mt-2 ${overflow ? "cal-day-events" : "cal-day-events cal-day-events--single"}`}>
                {dayMeetings.map((m) => {
                  const canceled = m.status === "cancelled";
                  const isToday = !canceled && localDayKey(m.starts_at) === dateKey(new Date());
                  const eventClass = [
                    "cal-event px-2 py-1.5 text-left text-xs",
                    canceled ? "cal-event--canceled" : "",
                    isToday ? "cal-event--today" : "",
                    selectedId === m.id ? "cal-event--selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div key={m.id} className={eventClass}>
                      {canceled ? <p className="cal-event__tag cal-event__tag--canceled mb-0.5">Canceled</p> : null}
                      {isToday ? <p className="cal-event__tag cal-event__tag--today mb-0.5">Today</p> : null}
                      <p
                        className={`font-medium ${
                          canceled
                            ? "text-[var(--danger)] line-through decoration-[var(--danger)]/70"
                            : isToday
                              ? "text-[var(--cyan)]"
                              : ""
                        }`}
                      >
                        {m.title}
                      </p>
                      <p className="text-[var(--muted)]">{formatDateTime(m.starts_at)}</p>
                      <p className={canceled ? "text-[var(--danger)]/80" : "text-[var(--cyan)]"}>{m.invitee_name}</p>
                      {m.target_role ? <Badge>{targetRoleLabel(m.target_role)}</Badge> : null}
                      <Button
                        type="button"
                        variant={selectedId === m.id ? "primary" : "ghost"}
                        className="mt-1.5 w-full !px-2 !py-1 text-[11px]"
                        onClick={() => openDetails(m)}
                      >
                        {selectedId === m.id ? "Viewing details" : "View details"}
                      </Button>
                      {isManager && canceled ? (
                        <Button
                          type="button"
                          className="mt-1 w-full !px-2 !py-1 text-[11px]"
                          disabled={busy}
                          onClick={() => {
                            openDetails(m);
                          }}
                        >
                          Reschedule…
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
                {dayMeetings.length === 0 ? <p className="text-xs text-[var(--muted)]">—</p> : null}
              </div>
            </Card>
          );
        })}
      </div>

      <div className={`grid gap-4 ${isManager ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2"}`}>
        {isManager ? (
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Schedule meeting</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Only managers can create meetings.</p>
            <form className="mt-3 grid gap-2" onSubmit={createMeeting}>
              <Input
                placeholder="Title"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                required
              />
              <Input
                placeholder="Invitee name"
                value={createForm.invitee_name}
                onChange={(e) => setCreateForm({ ...createForm, invitee_name: e.target.value })}
                required
              />
              <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                Invitee email(s)
                <Textarea
                  className="mt-1"
                  rows={3}
                  placeholder={"one@example.com\nor bulk: a@x.com, b@y.com"}
                  value={createForm.invitee_email}
                  onChange={(e) => setCreateForm({ ...createForm, invitee_email: e.target.value })}
                  required
                />
              </label>
              <p className="text-xs text-[var(--muted)]">
                Single email or multiple — separate with commas, spaces, or new lines.
              </p>
              <DatePicker
                mode="datetime"
                placeholder="Starts"
                value={createForm.starts_at}
                onChange={(starts_at) => setCreateForm({ ...createForm, starts_at })}
              />
              <DatePicker
                mode="datetime"
                placeholder="Ends"
                value={createForm.ends_at}
                onChange={(ends_at) => setCreateForm({ ...createForm, ends_at })}
              />
              <Textarea
                rows={2}
                placeholder="Job detail"
                value={createForm.job_detail}
                onChange={(e) => setCreateForm({ ...createForm, job_detail: e.target.value })}
              />
              <Select
                value={createForm.target_role}
                onChange={(e) => setCreateForm({ ...createForm, target_role: e.target.value as TargetRoleChoice })}
              >
                <option value="">Target role…</option>
                <option value="SDR">SDR</option>
                <option value="AE">AE</option>
                <option value="MANAGER">Manager</option>
                <option value="ALL">All roles</option>
              </Select>
              <Textarea
                rows={2}
                placeholder="Notes (optional)"
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
              />
              <Button type="submit" disabled={busy || !createForm.starts_at || !createForm.ends_at}>
                Create meeting
              </Button>
            </form>
          </Card>
        ) : null}

        {selected && draft ? (
          <Card>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Meeting details</p>
                <h2 className="font-[family-name:var(--font-display)] text-lg">{draft.title || selected.title}</h2>
                {selected.status === "cancelled" || draft.status === "cancelled" ? (
                  <p className="cal-event__tag cal-event__tag--canceled mt-1">Canceled</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {isManager && draft.status !== "cancelled" ? (
                  <Button variant="ghost" disabled={busy} onClick={() => cancelMeeting(selected.id)}>
                    Cancel event
                  </Button>
                ) : null}
                {isManager && draft.status === "cancelled" ? (
                  <Button disabled={busy} onClick={() => rescheduleMeeting(selected.id)}>
                    {busy ? "Rescheduling…" : "Reschedule"}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={closeDetails}>
                  Close
                </Button>
              </div>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">Host {selected.host?.username}</p>
            {isManager && draft.status === "cancelled" ? (
              <p className="mt-2 rounded border border-[rgba(0,229,255,0.35)] bg-[rgba(0,229,255,0.08)] px-3 py-2 text-xs text-[var(--cyan)] [text-shadow:0_0_8px_rgba(0,229,255,0.35)]">
                Pick new start and end times below, then hit Reschedule to restore this event.
              </p>
            ) : null}
            {isManager ? (
              <form className="mt-3 grid gap-3" onSubmit={saveDetails}>
                <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                  Title
                  <Input
                    className="mt-1"
                    value={draft.title}
                    disabled={busy}
                    onChange={(e) => patchDraft({ title: e.target.value })}
                    required
                  />
                </label>
                <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                  Job detail
                  <Textarea
                    className="mt-1"
                    rows={3}
                    value={draft.job_detail}
                    disabled={busy}
                    onChange={(e) => patchDraft({ job_detail: e.target.value })}
                  />
                </label>
                <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                  Target role
                  <Select
                    className="mt-1"
                    value={draft.target_role}
                    disabled={busy}
                    onChange={(e) => patchDraft({ target_role: e.target.value })}
                  >
                    <option value="">None</option>
                    <option value="SDR">SDR</option>
                    <option value="AE">AE</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ALL">All roles</option>
                  </Select>
                </label>
                <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                  Invitee name
                  <Input
                    className="mt-1"
                    value={draft.invitee_name}
                    disabled={busy}
                    onChange={(e) => patchDraft({ invitee_name: e.target.value })}
                    required
                  />
                </label>
                <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                  Invitee email(s)
                  <Textarea
                    className="mt-1"
                    rows={3}
                    value={draft.invitee_email}
                    disabled={busy}
                    onChange={(e) => patchDraft({ invitee_email: e.target.value })}
                    required
                  />
                </label>
                <DatePicker
                  mode="datetime"
                  placeholder={draft.status === "cancelled" ? "New start time" : "Starts"}
                  value={draft.starts_at}
                  onChange={(starts_at) => patchDraft({ starts_at })}
                />
                <DatePicker
                  mode="datetime"
                  placeholder={draft.status === "cancelled" ? "New end time" : "Ends"}
                  value={draft.ends_at}
                  onChange={(ends_at) => patchDraft({ ends_at })}
                />
                {draft.status !== "cancelled" ? (
                  <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                    Status
                    <Select
                      className="mt-1"
                      value={draft.status}
                      disabled={busy}
                      onChange={(e) => patchDraft({ status: e.target.value })}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </Select>
                  </label>
                ) : null}
                <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                  Notes
                  <Textarea
                    className="mt-1"
                    rows={2}
                    value={draft.notes}
                    disabled={busy}
                    onChange={(e) => patchDraft({ notes: e.target.value })}
                  />
                </label>
                {selected.opportunity ? (
                  <Link
                    href={`/opportunities/${selected.opportunity}`}
                    className="text-sm text-[var(--cyan)] underline"
                  >
                    Open deal
                  </Link>
                ) : null}
                <Button type="submit" disabled={busy || !dirty}>
                  {busy ? "Saving…" : dirty ? "Save meeting details" : "Saved"}
                </Button>
              </form>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">When</p>
                  <p className="mt-1">
                    {formatDateTime(selected.starts_at)} → {formatDateTime(selected.ends_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Job detail</p>
                  <p className="mt-1 whitespace-pre-wrap">{selected.job_detail || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Target role</p>
                  <p className="mt-1">
                    {selected.target_role ? targetRoleLabel(selected.target_role) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Invitees</p>
                  <p className="mt-1">{selected.invitee_name}</p>
                  <ul className="mt-1 space-y-0.5 text-[var(--cyan)]">
                    {selected.invitee_email
                      .split(/[\s,;]+/)
                      .map((e) => e.trim())
                      .filter(Boolean)
                      .map((email) => (
                        <li key={email}>{email}</li>
                      ))}
                  </ul>
                </div>
                {selected.notes ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Notes</p>
                    <p className="mt-1 whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                ) : null}
              </div>
            )}
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium">Comments</h3>
              <CommentThread endpoint={`/api/meetings/${selected.id}/comments/`} />
            </div>
          </Card>
        ) : (
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Meeting details</h2>
            <Empty>
              {isManager
                ? "Select a meeting and click View details to edit job, role, invitees, and more."
                : "Select a meeting that includes you to view details."}
            </Empty>
          </Card>
        )}

        {isManager ? (
          <div className="space-y-4">
            <Card>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Booking link</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Set a booking slug on your{" "}
                <Link href="/profile" className="underline">
                  profile
                </Link>
                .
              </p>
              {bookingUrl ? (
                <Link
                  href={user?.booking_slug ? `/book/${user.booking_slug}` : bookingUrl}
                  className="mt-3 inline-block text-sm font-medium text-[var(--cyan)] underline hover:opacity-90"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open public booking page
                </Link>
              ) : (
                <Empty>Add a booking slug on Profile to enable public booking.</Empty>
              )}
            </Card>

            <Card>
              <h2 className="font-[family-name:var(--font-display)] text-lg">Availability</h2>
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
        ) : null}
      </div>
    </div>
  );
}
