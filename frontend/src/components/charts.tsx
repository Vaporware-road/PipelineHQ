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
    <div className="space-y-2">
      {items.map((item) => {
        const value = Number(item[valueKey]) || 0;
        const pct = Math.round((value / max) * 100);
        return (
          <div key={String(item[labelKey])} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="truncate capitalize text-[var(--muted)]">{String(item[labelKey]).replaceAll("_", " ")}</span>
            <div className="h-2.5 overflow-hidden rounded bg-slate-100">
              <div
                className="h-full rounded bg-[var(--accent)] transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right tabular-nums">{value}</span>
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
              className="flex h-10 items-center justify-center rounded-md bg-[var(--accent-soft)] text-sm font-medium text-[var(--accent-ink)] transition-all duration-500"
              style={{ width: `${width}%`, minWidth: "8rem" }}
            >
              <span className="capitalize">{step.label.replaceAll("_", " ")}</span>
              <span className="ml-2 tabular-nums opacity-80">{step.count}</span>
            </div>
            {idx < steps.length - 1 ? (
              <div className="h-3 w-px bg-[var(--line)]" aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
