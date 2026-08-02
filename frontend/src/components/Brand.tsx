"use client";

import Link from "next/link";

const GITHUB_ORG = "https://github.com/Vaporware-road";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <a
      href={GITHUB_ORG}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 font-[family-name:var(--font-display)] tracking-[0.12em] text-[var(--muted)] transition hover:text-[var(--cyan)] ${className}`}
    >
      <span className="text-[var(--accent)] drop-shadow-[0_0_8px_rgba(255,43,214,0.45)]">Vaporware</span>
      <span className="text-[var(--line)]">-</span>
      <span className="text-[var(--cyan)]">Road</span>
    </a>
  );
}

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`mt-auto border-t border-[var(--line)] px-4 py-6 text-center sm:px-6 ${className}`}
    >
      <div className="mx-auto max-w-xl">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--cyan)]">
          About us
        </div>
        <Link
          href="/about"
          className="mt-3 inline-block font-[family-name:var(--font-display)] text-xs tracking-[0.14em] text-[var(--accent)] transition hover:text-[var(--cyan)] hover:drop-shadow-[0_0_10px_rgba(0,229,255,0.45)]"
        >
          Enter the Vaporware-Road signal →
        </Link>
      </div>

      <div className="mt-5 text-xs tracking-[0.06em] text-[var(--muted)]">
        <span className="text-[var(--ink)]">Vaporware</span>
        {" product by "}
        <a
          href={GITHUB_ORG}
          target="_blank"
          rel="noopener noreferrer"
          className="font-[family-name:var(--font-display)] tracking-[0.1em] text-[var(--cyan)] transition hover:text-[var(--accent)] hover:drop-shadow-[0_0_8px_rgba(255,43,214,0.4)]"
        >
          Vaporware-road
        </a>
      </div>
    </footer>
  );
}
