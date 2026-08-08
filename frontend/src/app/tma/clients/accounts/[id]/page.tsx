"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, Empty } from "@/components/ui";
import { api, apiListPage } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import type { Account, Contact } from "@/lib/types";

export default function TmaAccountDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { phase } = useTmaAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const [row, contactPage] = await Promise.all([
          api<Account>(`/api/accounts/${id}/`),
          apiListPage<Contact>(`/api/contacts/?account=${id}`),
        ]);
        if (!cancelled) {
          setAccount(row);
          setContacts(contactPage.results);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load account");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, id]);

  if (error && !account) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!account) return <Empty>Loading account…</Empty>;

  return (
    <div className="space-y-4">
      <Link href="/tma/clients" className="text-xs text-[var(--cyan)] hover:underline">
        ← Clients
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          {account.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {[account.domain, account.industry].filter(Boolean).join(" · ") || "Account"}
        </p>
      </div>

      <Card className="space-y-2 text-sm">
        <p>
          <span className="text-[var(--muted)]">Domain</span> {account.domain || "—"}
        </p>
        <p>
          <span className="text-[var(--muted)]">Industry</span> {account.industry || "—"}
        </p>
        <p>
          <span className="text-[var(--muted)]">Owner</span>{" "}
          {account.owner?.first_name || account.owner?.username || "—"}
        </p>
        {account.territory_name ? (
          <p>
            <span className="text-[var(--muted)]">Territory</span> {account.territory_name}
          </p>
        ) : null}
      </Card>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">
          Contacts
        </h2>
        {contacts.length === 0 ? (
          <Empty>No contacts on this account.</Empty>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id}>
                <Link href={`/tma/clients/contacts/${c.id}`}>
                  <Card className="transition hover:border-[var(--accent)]">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {c.title || c.email || "—"}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
