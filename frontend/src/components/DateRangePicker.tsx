"use client";

import { Button, Input } from "@/components/ui";
import { rangeForPreset, type DateRange, type RangePreset } from "@/lib/dateRange";

const PRESETS: { id: Exclude<RangePreset, "custom">; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map((p) => (
        <Button
          key={p.id}
          variant={value.preset === p.id ? "primary" : "ghost"}
          onClick={() => onChange(rangeForPreset(p.id))}
        >
          {p.label}
        </Button>
      ))}
      <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        From
        <Input
          type="date"
          className="datetime-field mt-1.5 w-40"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value, preset: "custom" })}
        />
      </label>
      <label className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        To
        <Input
          type="date"
          className="datetime-field mt-1.5 w-40"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value, preset: "custom" })}
        />
      </label>
    </div>
  );
}
