import { forwardRef, type ReactNode } from "react";
import { formatMoney } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-[0.04em] text-[var(--ink)]">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_0_0_1px_rgba(0,229,255,0.04),0_0_28px_rgba(255,43,214,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles =
    variant === "primary"
      ? "bg-[var(--accent)] text-white shadow-[0_0_18px_rgba(255,43,214,0.35)] hover:brightness-110 hover:shadow-[0_0_24px_rgba(255,43,214,0.5)]"
      : variant === "danger"
        ? "bg-[var(--danger)] text-white shadow-[0_0_14px_rgba(255,77,109,0.3)] hover:brightness-110"
        : "border border-[var(--line)] bg-transparent text-[var(--ink)] hover:border-[var(--cyan)] hover:bg-[rgba(0,229,255,0.08)] hover:text-[var(--cyan)]";
  return (
    <button
      className={`rounded-md px-3 py-2 text-sm font-medium transition duration-200 disabled:opacity-50 ${styles} ${className}`}
      {...props}
      type={type}
    >
      {children}
    </button>
  );
}

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--cyan)] focus:shadow-[0_0_0_1px_rgba(0,229,255,0.35),0_0_16px_rgba(0,229,255,0.15)]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldClass} ${props.className || ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldClass} ${props.className || ""}`} />;
}

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea(props, ref) {
    return <textarea ref={ref} {...props} className={`${fieldClass} ${props.className || ""}`} />;
  },
);

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" | "ok" }) {
  const map = {
    neutral: "border border-[var(--line)] bg-[var(--accent-soft)] text-[var(--muted)]",
    warn: "border border-[rgba(255,184,77,0.35)] bg-[rgba(255,184,77,0.12)] text-[#ffc857]",
    ok: "border border-[rgba(0,229,255,0.35)] bg-[rgba(0,229,255,0.12)] text-[var(--cyan)]",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium tracking-wide ${map[tone]}`}>
      {children}
    </span>
  );
}

export function Money({ value }: { value: string | number }) {
  return <span className="tabular-nums text-[var(--cyan)]">${formatMoney(value)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-[var(--muted)]">{children}</p>;
}
