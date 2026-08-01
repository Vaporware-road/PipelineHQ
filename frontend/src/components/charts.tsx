"use client";

export function BarChart({
  items,
  valueKey = "count",
  labelKey = "label",
}: {
  items: Record<string, string | number>[];
  valueKey?: string;
  labelKey?: string;
}) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  if (!items.length) {
    return <p className="py-6 text-center text-sm text-[var(--muted)]">No data in this range.</p>;
  }
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const value = Number(item[valueKey]) || 0;
        const pct = Math.round((value / max) * 100);
        return (
          <div key={String(item[labelKey])} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="truncate capitalize text-[var(--muted)]">{String(item[labelKey]).replaceAll("_", " ")}</span>
            <div className="h-2.5 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--input)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--cyan)] via-[#7a5cff] to-[var(--accent)] shadow-[0_0_14px_rgba(255,43,214,0.4)] transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right tabular-nums text-[var(--cyan)]">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function FunnelChart({
  steps,
}: {
  steps: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  if (!steps.length) {
    return <p className="py-6 text-center text-sm text-[var(--muted)]">No funnel data.</p>;
  }
  return (
    <div className="space-y-3">
      {steps.map((step, idx) => {
        const width = 40 + Math.round((step.count / max) * 60);
        return (
          <div key={step.label} className="flex flex-col items-center gap-1">
            <div
              className="flex h-10 items-center justify-center rounded-md border border-[var(--line)] bg-gradient-to-r from-[var(--accent-soft)] to-[rgba(0,229,255,0.08)] text-sm font-medium text-[var(--accent-ink)] shadow-[0_0_18px_rgba(255,43,214,0.14)] transition-all duration-500"
              style={{ width: `${width}%`, minWidth: "8rem" }}
            >
              <span className="capitalize">{step.label.replaceAll("_", " ")}</span>
              <span className="ml-2 tabular-nums text-[var(--cyan)] opacity-90">{step.count}</span>
            </div>
            {idx < steps.length - 1 ? (
              <div className="h-3 w-px bg-gradient-to-b from-[var(--accent)] to-[var(--cyan)]" aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
