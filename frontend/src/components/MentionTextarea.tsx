"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui";
import { apiList } from "@/lib/api";
import type { Role, User } from "@/lib/types";

const ROLES: { value: Role; label: string }[] = [
  { value: "SDR", label: "SDR" },
  { value: "AE", label: "AE" },
  { value: "MANAGER", label: "Manager" },
];

type Suggestion =
  | { kind: "role"; value: string; label: string }
  | { kind: "user"; value: string; label: string };

type MentionState = {
  open: boolean;
  mode: "role" | "user" | null;
  query: string;
  tokenStart: number;
};

const CLOSED: MentionState = { open: false, mode: null, query: "", tokenStart: -1 };

/** Detect an active @role or @@user token ending at the caret. */
function parseMention(text: string, caret: number): MentionState {
  const before = text.slice(0, Math.max(0, caret));

  // @@username (must win over single @)
  const userMatch = before.match(/(?:^|[\s([{])@@([\w]*)$/);
  if (userMatch) {
    const query = userMatch[1];
    return {
      open: true,
      mode: "user",
      query,
      tokenStart: before.length - query.length - 2,
    };
  }

  // @ROLE — not @@
  const roleMatch = before.match(/(?:^|[\s([{])@([A-Za-z]*)$/);
  if (roleMatch) {
    const query = roleMatch[1];
    return {
      open: true,
      mode: "role",
      query,
      tokenStart: before.length - query.length - 1,
    };
  }

  return CLOSED;
}

export function MentionTextarea({
  value,
  onChange,
  rows = 3,
  disabled,
  placeholder = "Write a comment… Use @ for a role, @@ for a user.",
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [team, setTeam] = useState<User[]>([]);
  const [mention, setMention] = useState<MentionState>(CLOSED);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiList<User>("/api/auth/team/")
      .then((users) => setTeam(Array.isArray(users) ? users : []))
      .catch(() => setTeam([]));
  }, []);

  const suggestions: Suggestion[] = useMemo(() => {
    if (!mention.open || !mention.mode) return [];
    const q = mention.query.toLowerCase();
    if (mention.mode === "role") {
      return ROLES.filter(
        (r) => !q || r.value.toLowerCase().startsWith(q) || r.label.toLowerCase().startsWith(q),
      ).map((r) => ({ kind: "role" as const, value: r.value, label: `@${r.value}` }));
    }
    return team
      .filter((u) => !q || u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
      .slice(0, 8)
      .map((u) => ({
        kind: "user" as const,
        value: u.username,
        label: `@@${u.username} · ${u.role}`,
      }));
  }, [mention, team]);

  function syncFromCaret(text: string, caret: number) {
    setMention(parseMention(text, caret));
    setActive(0);
  }

  function applySuggestion(s: Suggestion) {
    const el = ref.current;
    if (!el || mention.tokenStart < 0) return;
    const caret = el.selectionStart;
    const insert = s.kind === "user" ? `@@${s.value} ` : `@${s.value} `;
    const next = value.slice(0, mention.tokenStart) + insert + value.slice(caret);
    const pos = mention.tokenStart + insert.length;
    onChange(next);
    setMention(CLOSED);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  const showMenu = mention.open && (suggestions.length > 0 || mention.mode === "user");

  return (
    <div className="relative isolate">
      {showMenu ? (
        <ul
          className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-32 overflow-y-auto rounded border border-[var(--line)]/40 bg-[color-mix(in_oklab,var(--panel)_82%,transparent)] py-0.5 text-xs shadow-none backdrop-blur-[1px]"
          role="listbox"
        >
          {mention.mode === "user" && suggestions.length === 0 ? (
            <li className="px-2 py-1 text-[var(--muted)]">No matching users</li>
          ) : (
            suggestions.map((s, i) => (
              <li key={`${s.kind}-${s.value}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`block w-full px-2 py-1 text-left leading-snug text-[var(--fg)]/85 ${
                    i === active ? "bg-[var(--line)]/35" : "hover:bg-[var(--line)]/20"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(s);
                  }}
                >
                  {s.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      <Textarea
        ref={ref}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          syncFromCaret(next, e.target.selectionStart);
        }}
        onKeyUp={(e) => {
          const el = e.target as HTMLTextAreaElement;
          // Always read from the DOM — props `value` can be one keystroke behind
          syncFromCaret(el.value, el.selectionStart);
        }}
        onClick={(e) => {
          const el = e.target as HTMLTextAreaElement;
          syncFromCaret(el.value, el.selectionStart);
        }}
        onBlur={() => {
          window.setTimeout(() => setMention(CLOSED), 120);
        }}
        onKeyDown={(e) => {
          if (!showMenu || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            applySuggestion(suggestions[active]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setMention(CLOSED);
          }
        }}
      />
      <p className="mt-1 text-[11px] text-[var(--muted)]">@ opens roles · @@ opens people</p>
    </div>
  );
}
