"use client";

import { useEffect, useState } from "react";
import { Card, Empty } from "@/components/ui";
import { apiList } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import type { Account, Contact } from "@/lib/types";

export default function TmaClientsPage() {
  const { phase } = useTmaAuth();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const [a, c] = await Promise.all([
          apiList<Account>("/api/accounts/"),
          apiList<Contact>("/api/contacts/"),
        ]);
        if (!cancelled) {
          setAccounts(a.slice(0, 25));
          setContacts(c.slice(0, 25));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load clients");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (error) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (accounts === null || contacts === null) return <Empty>Loading clients…</Empty>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          Clients
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Accounts and contacts at a glance.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">
          Accounts
        </h2>
        {accounts.length === 0 ? (
          <Empty>No accounts.</Empty>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id}>
                <Card>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {[a.domain, a.industry].filter(Boolean).join(" · ") || "—"}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">
          Contacts
        </h2>
        {contacts.length === 0 ? (
          <Empty>No contacts.</Empty>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id}>
                <Card>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {c.account_name}
                    {c.title ? ` · ${c.title}` : ""}
                  </p>
                  {c.email ? <p className="mt-1 text-xs text-[var(--cyan)]">{c.email}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
