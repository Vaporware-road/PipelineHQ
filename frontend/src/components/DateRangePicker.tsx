"use client";

import { DatePicker } from "@/components/DateTimeFields";
import { Button } from "@/components/ui";
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
      <DatePicker
        mode="date"
        label="From"
        placeholder="Start date"
        value={value.from}
        onChange={(from) => onChange({ ...value, from, preset: "custom" })}
        className="w-44"
      />
      <DatePicker
        mode="date"
        label="To"
        placeholder="End date"
        value={value.to}
        onChange={(to) => onChange({ ...value, to, preset: "custom" })}
        className="w-44"
        align="right"
      />
    </div>
  );
}
