"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/** Split / join `datetime-local` values (`YYYY-MM-DDTHH:mm`). */
export function splitDateTime(value: string): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export function joinDateTime(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "09:00"}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseParts(value: string) {
  const { date, time } = splitDateTime(value);
  const now = new Date();
  const [y, m, d] = date
    ? date.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  const [hh, mm] = time
    ? time.split(":").map(Number)
    : [now.getHours(), Math.floor(now.getMinutes() / 5) * 5];
  return {
    year: y,
    month: m,
    day: d,
    hour24: hh,
    minute: mm,
    hasValue: Boolean(date),
  };
}

function toValue(year: number, month: number, day: number, hour24: number, minute: number) {
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour24)}:${pad(minute)}`;
}

function formatTrigger(value: string) {
  if (!value) return "Set due date & time";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Set due date & time";
  return dt.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type ClockMode = "hour" | "minute";

export function DateTimeFields({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  dateLabel?: string;
  timeLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseParts(value).year);
  const [viewMonth, setViewMonth] = useState(() => parseParts(value).month);
  const [draft, setDraft] = useState(value);
  const [clockMode, setClockMode] = useState<ClockMode>("hour");
  const [timeUi, setTimeUi] = useState<"clock" | "wheel">("clock");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const parts = parseParts(value || draft);
    setDraft(
      value ||
        toValue(parts.year, parts.month, parts.day, parts.hour24, parts.minute),
    );
    setViewYear(parts.year);
    setViewMonth(parts.month);
    setClockMode("hour");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const parts = useMemo(() => parseParts(draft), [draft]);
  const hour12 = parts.hour24 % 12 || 12;
  const isPm = parts.hour24 >= 12;

  function commitDraft(next: string) {
    setDraft(next);
    onChange(next);
  }

  function setDay(day: number) {
    commitDraft(toValue(viewYear, viewMonth, day, parts.hour24, parts.minute));
  }

  function setHour12(h12: number) {
    let h24 = h12 % 12;
    if (isPm) h24 += 12;
    commitDraft(toValue(parts.year, parts.month, parts.day, h24, parts.minute));
    setClockMode("minute");
  }

  function setMinute(m: number) {
    commitDraft(toValue(parts.year, parts.month, parts.day, parts.hour24, m));
  }

  function setPeriod(pm: boolean) {
    let h = parts.hour24 % 12;
    if (pm) h += 12;
    commitDraft(toValue(parts.year, parts.month, parts.day, h, parts.minute));
  }

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  }

  function setToday() {
    const n = new Date();
    const next = toValue(
      n.getFullYear(),
      n.getMonth() + 1,
      n.getDate(),
      n.getHours(),
      Math.floor(n.getMinutes() / 5) * 5,
    );
    commitDraft(next);
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth() + 1);
  }

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const out: ({ day: number; inMonth: true } | { day: null; inMonth: false })[] = [];
    for (let i = 0; i < startPad; i++) out.push({ day: null, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) out.push({ day: d, inMonth: true });
    while (out.length % 7 !== 0) out.push({ day: null, inMonth: false });
    return out;
  }, [viewYear, viewMonth]);

  const today = new Date();
  const selectedInView =
    parts.year === viewYear && parts.month === viewMonth ? parts.day : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <label className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Due
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="futuristic-dt-trigger mt-1.5 flex w-full min-w-[13.5rem] items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--input)] px-3 py-2 text-left text-sm text-[var(--ink)] outline-none transition hover:border-[var(--cyan)] focus:border-[var(--cyan)] focus:shadow-[0_0_0_1px_rgba(0,229,255,0.35),0_0_16px_rgba(0,229,255,0.15)]"
        >
          <span className={value ? "tabular-nums tracking-wide" : "text-[var(--muted)]"}>
            {formatTrigger(value)}
          </span>
          <span className="futuristic-dt-trigger-icon" aria-hidden>
            ◈
          </span>
        </button>
      </label>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose due date and time"
          className="futuristic-dt-panel absolute right-0 z-40 mt-2 w-[min(100vw-2rem,22rem)] origin-top-right overflow-hidden rounded-xl border border-[var(--line)] sm:w-[26.5rem]"
        >
          <div className="futuristic-dt-header flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-baseline gap-1 font-[family-name:var(--font-display)] text-3xl tracking-[0.08em] text-[var(--ink)]">
              <button
                type="button"
                className={`tabular-nums transition ${
                  clockMode === "hour"
                    ? "text-[var(--accent)] drop-shadow-[0_0_10px_rgba(255,43,214,0.55)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
                onClick={() => setClockMode("hour")}
              >
                {pad(hour12)}
              </button>
              <span className="futuristic-dt-colon text-[var(--cyan)]">:</span>
              <button
                type="button"
                className={`tabular-nums transition ${
                  clockMode === "minute"
                    ? "text-[var(--cyan)] drop-shadow-[0_0_10px_rgba(0,229,255,0.55)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
                onClick={() => setClockMode("minute")}
              >
                {pad(parts.minute)}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setPeriod(false)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-[0.16em] transition ${
                  !isPm
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[rgba(255,43,214,0.4)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setPeriod(true)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-[0.16em] transition ${
                  isPm
                    ? "bg-[rgba(0,229,255,0.12)] text-[var(--cyan)] ring-1 ring-[rgba(0,229,255,0.4)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                PM
              </button>
            </div>
          </div>

          <div className="grid gap-0 sm:grid-cols-2">
            <div className="border-b border-[var(--line)] p-3 sm:border-b-0 sm:border-r">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  className="futuristic-dt-nav"
                  aria-label="Previous month"
                  onClick={() => shiftMonth(-1)}
                >
                  ‹
                </button>
                <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.14em] text-[var(--cyan)]">
                  {MONTHS[viewMonth - 1]} {viewYear}
                </p>
                <button
                  type="button"
                  className="futuristic-dt-nav"
                  aria-label="Next month"
                  onClick={() => shiftMonth(1)}
                >
                  ›
                </button>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((w) => (
                  <span
                    key={w}
                    className="py-1 text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
                  >
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((cell, i) => {
                  if (!cell.inMonth || cell.day == null) {
                    return <span key={`e-${i}`} className="aspect-square" />;
                  }
                  const isSelected = selectedInView === cell.day;
                  const isToday =
                    today.getFullYear() === viewYear &&
                    today.getMonth() + 1 === viewMonth &&
                    today.getDate() === cell.day;
                  return (
                    <button
                      key={cell.day}
                      type="button"
                      onClick={() => setDay(cell.day)}
                      className={`aspect-square rounded-md text-xs tabular-nums transition ${
                        isSelected
                          ? "bg-[var(--accent)] text-white shadow-[0_0_14px_rgba(255,43,214,0.45)]"
                          : isToday
                            ? "ring-1 ring-[var(--cyan)] text-[var(--cyan)] hover:bg-[rgba(0,229,255,0.1)]"
                            : "text-[var(--ink)] hover:bg-[rgba(255,43,214,0.12)]"
                      }`}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-2.5 p-3">
              <div className="flex w-full items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  {timeUi === "clock"
                    ? clockMode === "hour"
                      ? "Select hour"
                      : "Select minute"
                    : "Scroll time"}
                </p>
                <div className="flex rounded-md border border-[var(--line)] p-0.5">
                  {(["clock", "wheel"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTimeUi(mode)}
                      className={`rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] transition ${
                        timeUi === mode
                          ? "bg-[rgba(0,229,255,0.14)] text-[var(--cyan)]"
                          : "text-[var(--muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {timeUi === "clock" ? (
                <AnalogClock
                  mode={clockMode}
                  hour12={hour12}
                  minute={parts.minute}
                  onPickHour={setHour12}
                  onPickMinute={setMinute}
                />
              ) : (
                <TimeWheel
                  hour12={hour12}
                  minute={parts.minute}
                  onPickHour={setHour12}
                  onPickMinute={setMinute}
                />
              )}

              <div className="flex gap-1.5">
                {[0, 15, 30, 45].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMinute(m);
                      setClockMode("minute");
                    }}
                    className={`rounded border px-2 py-1 text-[10px] tabular-nums tracking-wide transition ${
                      parts.minute === m
                        ? "border-[var(--cyan)] text-[var(--cyan)] shadow-[var(--glow-cyan)]"
                        : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--cyan)] hover:text-[var(--ink)]"
                    }`}
                  >
                    :{pad(m)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-3 py-2.5">
            <button
              type="button"
              className="text-xs text-[var(--muted)] transition hover:text-[var(--danger)]"
              onClick={() => {
                setDraft("");
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--muted)] transition hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
                onClick={setToday}
              >
                Now
              </button>
              <button
                type="button"
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white shadow-[0_0_16px_rgba(255,43,214,0.35)] transition hover:brightness-110"
                onClick={() => {
                  if (draft) onChange(draft);
                  else if (!value) {
                    const n = new Date();
                    onChange(
                      toValue(
                        n.getFullYear(),
                        n.getMonth() + 1,
                        n.getDate(),
                        n.getHours(),
                        Math.floor(n.getMinutes() / 5) * 5,
                      ),
                    );
                  }
                  setOpen(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimeWheel({
  hour12,
  minute,
  onPickHour,
  onPickMinute,
}: {
  hour12: number;
  minute: number;
  onPickHour: (h: number) => void;
  onPickMinute: (m: number) => void;
}) {
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hEl = hourRef.current?.querySelector(`[data-val="${hour12}"]`);
    hEl?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hour12]);

  useEffect(() => {
    const mEl = minuteRef.current?.querySelector(`[data-val="${minute}"]`);
    mEl?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [minute]);

  return (
    <div className="futuristic-wheel relative flex h-[168px] w-full max-w-[200px] gap-2 rounded-xl border border-[var(--line)] bg-[rgba(11,6,20,0.65)] p-2">
      <div className="futuristic-wheel-fade pointer-events-none absolute inset-x-2 top-2 h-8 rounded-t-lg" />
      <div className="futuristic-wheel-fade-bottom pointer-events-none absolute inset-x-2 bottom-2 h-8 rounded-b-lg" />
      <div className="pointer-events-none absolute inset-x-2 top-1/2 h-9 -translate-y-1/2 rounded-md border border-[rgba(0,229,255,0.35)] bg-[rgba(0,229,255,0.08)] shadow-[0_0_18px_rgba(0,229,255,0.15)]" />

      <div ref={hourRef} className="futuristic-wheel-col flex-1 overflow-y-auto scroll-smooth py-[66px]">
        {hours.map((h) => (
          <button
            key={h}
            type="button"
            data-val={h}
            onClick={() => onPickHour(h)}
            className={`flex h-9 w-full items-center justify-center font-[family-name:var(--font-display)] text-sm tabular-nums tracking-wider transition ${
              h === hour12 ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {pad(h)}
          </button>
        ))}
      </div>
      <div className="flex items-center font-[family-name:var(--font-display)] text-lg text-[var(--cyan)]">:</div>
      <div ref={minuteRef} className="futuristic-wheel-col flex-1 overflow-y-auto scroll-smooth py-[66px]">
        {minutes.map((m) => (
          <button
            key={m}
            type="button"
            data-val={m}
            onClick={() => onPickMinute(m)}
            className={`flex h-9 w-full items-center justify-center font-[family-name:var(--font-display)] text-sm tabular-nums tracking-wider transition ${
              m === minute ? "text-[var(--cyan)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {pad(m)}
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalogClock({
  mode,
  hour12,
  minute,
  onPickHour,
  onPickMinute,
}: {
  mode: ClockMode;
  hour12: number;
  minute: number;
  onPickHour: (h: number) => void;
  onPickMinute: (m: number) => void;
}) {
  const size = 168;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 68;
  const selected = mode === "hour" ? hour12 % 12 || 12 : minute;
  const angleDeg =
    mode === "hour" ? (hour12 % 12) * 30 - 90 : (minute / 60) * 360 - 90;
  const rad = (angleDeg * Math.PI) / 180;
  const handX = cx + Math.cos(rad) * (radius - 18);
  const handY = cy + Math.sin(rad) * (radius - 18);

  const ticks =
    mode === "hour"
      ? Array.from({ length: 12 }, (_, i) => i + 1)
      : Array.from({ length: 12 }, (_, i) => i * 5);

  function pickFromPoint(clientX: number, clientY: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    if (mode === "hour") {
      let h = Math.round(deg / 30) % 12;
      if (h === 0) h = 12;
      onPickHour(h);
    } else {
      const m = Math.round(deg / 30) * 5;
      onPickMinute(m === 60 ? 0 : m);
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="futuristic-clock touch-none select-none"
      role="img"
      aria-label={mode === "hour" ? `Hour ${hour12}` : `Minute ${pad(minute)}`}
      onPointerDown={(e) => {
        const svg = e.currentTarget;
        svg.setPointerCapture(e.pointerId);
        pickFromPoint(e.clientX, e.clientY, svg);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        pickFromPoint(e.clientX, e.clientY, e.currentTarget);
      }}
    >
      <defs>
        <radialGradient id="clockGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,43,214,0.35)" />
          <stop offset="55%" stopColor="rgba(0,229,255,0.08)" />
          <stop offset="100%" stopColor="rgba(11,6,20,0.9)" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={radius + 8} fill="url(#clockGlow)" />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="rgba(16,10,30,0.92)"
        stroke="rgba(0,229,255,0.35)"
        strokeWidth="1.5"
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius - 2}
        fill="none"
        stroke="rgba(255,43,214,0.18)"
        strokeWidth="1"
        strokeDasharray="2 6"
      />

      {ticks.map((n) => {
        const a = mode === "hour" ? n * 30 - 90 : (n / 60) * 360 - 90;
        const r = (a * Math.PI) / 180;
        const tx = cx + Math.cos(r) * (radius - 22);
        const ty = cy + Math.sin(r) * (radius - 22);
        const active =
          mode === "hour" ? n === (hour12 % 12 || 12) : n === minute;
        return (
          <g key={`${mode}-${n}`}>
            <circle
              cx={tx}
              cy={ty}
              r={active ? 14 : 12}
              fill={
                active
                  ? mode === "hour"
                    ? "var(--accent)"
                    : "var(--cyan)"
                  : "transparent"
              }
              className="transition"
            />
            <text
              x={tx}
              y={ty + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              className="pointer-events-none"
              fill={active ? "#fff" : "var(--muted)"}
              fontSize="11"
              fontFamily="var(--font-display)"
              fontWeight="600"
            >
              {mode === "hour" ? n : pad(n)}
            </text>
          </g>
        );
      })}

      <line
        x1={cx}
        y1={cy}
        x2={handX}
        y2={handY}
        stroke={mode === "hour" ? "var(--accent)" : "var(--cyan)"}
        strokeWidth="2.5"
        strokeLinecap="round"
        style={{
          filter:
            mode === "hour"
              ? "drop-shadow(0 0 6px rgba(255,43,214,0.8))"
              : "drop-shadow(0 0 6px rgba(0,229,255,0.8))",
        }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={mode === "hour" ? "var(--accent)" : "var(--cyan)"}
      />
      <circle cx={handX} cy={handY} r={4} fill="#fff" opacity="0.9" />
      <title>
        {mode === "hour" ? `Hour ${selected}` : `Minute ${pad(selected)}`}
      </title>
    </svg>
  );
}
