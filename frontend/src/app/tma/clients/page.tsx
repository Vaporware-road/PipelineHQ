"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TmaLoadMore } from "@/components/tma/TmaLoadMore";
import { Card, Empty } from "@/components/ui";
import { apiListPage } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import type { Account, Contact } from "@/lib/types";

export default function TmaClientsPage() {
  const { phase } = useTmaAuth();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [accountCount, setAccountCount] = useState(0);
  const [contactCount, setContactCount] = useState(0);
  const [accountNext, setAccountNext] = useState<string | null>(null);
  const [contactNext, setContactNext] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const [a, c] = await Promise.all([
          apiListPage<Account>("/api/accounts/"),
          apiListPage<Contact>("/api/contacts/"),
        ]);
        if (!cancelled) {
          setAccounts(a.results);
          setAccountCount(a.count);
          setAccountNext(a.next);
          setContacts(c.results);
          setContactCount(c.count);
          setContactNext(c.next);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load clients");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const loadMoreAccounts = useCallback(async () => {
    if (!accountNext || loadingAccounts) return;
    setLoadingAccounts(true);
    setError("");
    try {
      const page = await apiListPage<Account>(accountNext);
      setAccounts((prev) => [...(prev ?? []), ...page.results]);
      setAccountCount(page.count);
      setAccountNext(page.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more accounts");
    } finally {
      setLoadingAccounts(false);
    }
  }, [accountNext, loadingAccounts]);

  const loadMoreContacts = useCallback(async () => {
    if (!contactNext || loadingContacts) return;
    setLoadingContacts(true);
    setError("");
    try {
      const page = await apiListPage<Contact>(contactNext);
      setContacts((prev) => [...(prev ?? []), ...page.results]);
      setContactCount(page.count);
      setContactNext(page.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more contacts");
    } finally {
      setLoadingContacts(false);
    }
  }, [contactNext, loadingContacts]);

  if (error && (accounts === null || contacts === null)) {
    return <p className="text-sm text-[var(--danger)]">{error}</p>;
  }
  if (accounts === null || contacts === null) return <Empty>Loading clients…</Empty>;

  return (
    <div className="space-y-6">
      <Link href="/tma" className="text-xs text-[var(--cyan)] hover:underline">
        ← Home
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          Clients
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Accounts and contacts. Tap for details.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">
          Accounts
        </h2>
        {accounts.length === 0 ? (
          <Empty>No accounts.</Empty>
        ) : (
          <>
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li key={a.id}>
                  <Link href={`/tma/clients/accounts/${a.id}`}>
                    <Card className="transition hover:border-[var(--accent)]">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {[a.domain, a.industry].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
            <TmaLoadMore
              shown={accounts.length}
              total={accountCount}
              next={accountNext}
              loading={loadingAccounts}
              onLoadMore={loadMoreAccounts}
            />
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">
          Contacts
        </h2>
        {contacts.length === 0 ? (
          <Empty>No contacts.</Empty>
        ) : (
          <>
            <ul className="space-y-2">
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/tma/clients/contacts/${c.id}`}>
                    <Card className="transition hover:border-[var(--accent)]">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {c.account_name}
                        {c.title ? ` · ${c.title}` : ""}
                      </p>
                      {c.email ? <p className="mt-1 text-xs text-[var(--cyan)]">{c.email}</p> : null}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
            <TmaLoadMore
              shown={contacts.length}
              total={contactCount}
              next={contactNext}
              loading={loadingContacts}
              onLoadMore={loadMoreContacts}
            />
          </>
        )}
      </section>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
