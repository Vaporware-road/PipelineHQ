"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type SearchHit = {
  type: string;
  id: number;
  label: string;
  subtitle: string;
  href: string;
};

type SearchResponse = {
  q: string;
  results: SearchHit[];
};

const TYPE_LABEL: Record<string, string> = {
  lead: "Lead",
  account: "Account",
  contact: "Contact",
  opportunity: "Deal",
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults([]);
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!open) return;
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await api<SearchResponse>(`/api/search/?q=${encodeURIComponent(q.trim())}`);
        setResults(data.results);
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q, open]);

  function go(hit: SearchHit) {
    close();
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-md border border-[var(--line)] px-2.5 py-1.5 text-sm text-[var(--muted)] transition hover:border-[var(--cyan)] hover:text-[var(--cyan)] sm:inline-flex"
        aria-label="Search"
      >
        <span>Search</span>
        <kbd className="rounded border border-[var(--line)] bg-[var(--input)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--cyan)]">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--line)] px-2 py-1 text-sm text-[var(--muted)] transition hover:border-[var(--cyan)] hover:text-[var(--cyan)] sm:hidden"
        aria-label="Search"
      >
        Search
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(11,6,20,0.78)] px-4 pt-[12vh] backdrop-blur-md"
          onClick={close}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_0_0_1px_rgba(0,229,255,0.08),0_0_48px_rgba(255,43,214,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[var(--line)] bg-[var(--input)] px-3 py-2">
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search leads, accounts, contacts, deals…"
                className="w-full bg-transparent py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {loading ? <p className="px-2 py-3 text-sm text-[var(--muted)]">Searching…</p> : null}
              {!loading && q.trim().length >= 2 && results.length === 0 ? (
                <p className="px-2 py-3 text-sm text-[var(--muted)]">No matches.</p>
              ) : null}
              {!loading && q.trim().length < 2 ? (
                <p className="px-2 py-3 text-sm text-[var(--muted)]">Type at least 2 characters.</p>
              ) : null}
              {results.map((hit, i) => (
                <button
                  key={`${hit.type}-${hit.id}`}
                  type="button"
                  onClick={() => go(hit)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition ${
                    i === active
                      ? "bg-[var(--accent-soft)] text-[var(--accent-ink)] shadow-[0_0_16px_rgba(255,43,214,0.15)] ring-1 ring-[rgba(255,43,214,0.28)]"
                      : "hover:bg-[rgba(0,229,255,0.06)]"
                  }`}
                >
                  <span className="mt-0.5 rounded border border-[var(--line)] bg-[var(--input)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--cyan)]">
                    {TYPE_LABEL[hit.type] || hit.type}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--ink)]">{hit.label}</span>
                    <span className="block truncate text-xs text-[var(--muted)]">{hit.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-[var(--line)] bg-[var(--input)] px-3 py-2 text-[10px] tracking-[0.08em] text-[var(--muted)]">
              ↑↓ navigate · Enter open · Esc close
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
