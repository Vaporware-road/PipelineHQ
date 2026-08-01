export type RangePreset = "7d" | "30d" | "90d" | "custom";

export type DateRange = {
  from: string;
  to: string;
  preset: RangePreset;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function rangeForPreset(preset: Exclude<RangePreset, "custom">): DateRange {
  const to = new Date();
  const from = new Date();
  const days = preset === "7d" ? 6 : preset === "30d" ? 29 : 89;
  from.setDate(to.getDate() - days);
  return { from: isoDate(from), to: isoDate(to), preset };
}

export function defaultRange(): DateRange {
  return rangeForPreset("30d");
}

export function qs(range: DateRange): string {
  return `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}
