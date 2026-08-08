"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, Empty } from "@/components/ui";
import { api } from "@/lib/api";
import { useTmaAuth } from "@/lib/tma-auth";
import type { Contact } from "@/lib/types";

export default function TmaContactDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const { phase } = useTmaAuth();
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const row = await api<Contact>(`/api/contacts/${id}/`);
        if (!cancelled) setContact(row);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load contact");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, id]);

  if (error && !contact) return <p className="text-sm text-[var(--danger)]">{error}</p>;
  if (!contact) return <Empty>Loading contact…</Empty>;

  return (
    <div className="space-y-4">
      <Link href="/tma/clients" className="text-xs text-[var(--cyan)] hover:underline">
        ← Clients
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[0.06em]">
          {contact.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {contact.title || "Contact"}
          {contact.account_name ? ` · ${contact.account_name}` : ""}
        </p>
      </div>

      <Card className="space-y-2 text-sm">
        <p>
          <span className="text-[var(--muted)]">Email</span> {contact.email || "—"}
        </p>
        <p>
          <span className="text-[var(--muted)]">Phone</span> {contact.phone || "—"}
        </p>
        <p>
          <span className="text-[var(--muted)]">Title</span> {contact.title || "—"}
        </p>
        <p>
          <span className="text-[var(--muted)]">Account</span>{" "}
          {contact.account ? (
            <Link
              href={`/tma/clients/accounts/${contact.account}`}
              className="text-[var(--cyan)] hover:underline"
            >
              {contact.account_name || `Account #${contact.account}`}
            </Link>
          ) : (
            "—"
          )}
        </p>
      </Card>
    </div>
  );
}
