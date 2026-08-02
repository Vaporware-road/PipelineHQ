"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import type { DuplicateSuspect } from "@/lib/types";

export function DuplicateSuspects({
  suspects,
  onCreateAnyway,
  onCancel,
  busy,
}: {
  suspects: DuplicateSuspect[];
  onCreateAnyway: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!suspects.length) return null;
  return (
    <div className="rounded-lg border border-[rgba(255,180,0,0.35)] bg-[rgba(255,180,0,0.08)] p-3">
      <p className="text-sm font-medium text-[var(--ink)]">Possible duplicates</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Review existing records before creating. You can create anyway if these are different people.
      </p>
      <ul className="mt-3 space-y-2">
        {suspects.map((s) => (
          <li key={`${s.entity_type}-${s.id}`} className="rounded border border-[var(--line)] bg-[var(--input)] px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link href={s.href} className="font-medium hover:text-[var(--cyan)]">
                  {s.label}
                </Link>
                <div className="text-xs text-[var(--muted)]">{s.subtitle}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--cyan)]">
                  {s.reasons.join(" · ")}
                </div>
              </div>
              <span className="text-xs text-[var(--muted)]">score {s.score}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={onCreateAnyway}>
          Create anyway
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
