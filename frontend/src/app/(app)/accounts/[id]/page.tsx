"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TimelineFeed } from "@/components/TimelineFeed";
import { CustomFieldsPanel } from "@/components/CustomFieldsPanel";
import { Badge, Button, Card, Empty, Input, Money, PageHeader } from "@/components/ui";
import { api, apiList, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Account, Contact, DuplicateSuspect, Opportunity } from "@/lib/types";
import { DuplicateSuspects } from "@/components/DuplicateSuspects";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [contactForm, setContactForm] = useState({ name: "", email: "", title: "", phone: "" });
  const [dupes, setDupes] = useState<DuplicateSuspect[]>([]);
  const [mergeLoser, setMergeLoser] = useState("");

  async function load() {
    try {
      const [a, c, o] = await Promise.all([
        api<Account>(`/api/accounts/${params.id}/`),
        apiList<Contact>(`/api/contacts/?account=${params.id}`),
        apiList<Opportunity>(`/api/opportunities/?account=${params.id}`),
      ]);
      setAccount(a);
      setContacts(c);
      setOpps(o);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load account");
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function saveField(patch: Partial<Account>) {
    setBusy(true);
    setError("");
    try {
      setAccount(await api<Account>(`/api/accounts/${params.id}/`, { method: "PATCH", body: JSON.stringify(patch) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function createContact(force = false) {
    setBusy(true);
    setError("");
    try {
      await api<Contact>("/api/contacts/", {
        method: "POST",
        body: JSON.stringify({
          account: Number(params.id),
          ...contactForm,
          force_create: force,
        }),
      });
      setContactForm({ name: "", email: "", title: "", phone: "" });
      setDupes([]);
      await load();
      setTimelineKey((k) => k + 1);
    } catch (e) {
      if (e instanceof ApiError && e.body && typeof e.body === "object") {
        const body = e.body as { duplicates?: DuplicateSuspect[]; detail?: string };
        if (body.duplicates?.length) {
          setDupes(body.duplicates);
          setError(body.detail || "Possible duplicates found.");
          return;
        }
      }
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function mergeAccounts() {
    if (!mergeLoser.trim() || !account) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/duplicates/merge/", {
        method: "POST",
        body: JSON.stringify({
          entity_type: "account",
          winner_id: account.id,
          loser_id: Number(mergeLoser),
        }),
      });
      setMergeLoser("");
      await load();
      setTimelineKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  if (!account) {
    return (
      <div>
        <PageHeader title="Account" subtitle="Loading…" />
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : <Empty>Loading account…</Empty>}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={account.name}
        subtitle={[account.domain, account.industry].filter(Boolean).join(" · ") || "Account"}
        actions={
          <Link href="/accounts" className="text-sm text-[var(--cyan)] hover:underline">
            ← Accounts
          </Link>
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="font-[family-name:var(--font-display)] text-lg">Details</h2>
          <div className="mt-3 space-y-3">
            <Field label="Name">
              <Input
                defaultValue={account.name}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== account.name) saveField({ name: e.target.value });
                }}
              />
            </Field>
            <Field label="Domain">
              <Input
                defaultValue={account.domain}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== account.domain) saveField({ domain: e.target.value });
                }}
              />
            </Field>
            <Field label="Industry">
              <Input
                defaultValue={account.industry}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== account.industry) saveField({ industry: e.target.value });
                }}
              />
            </Field>
            <p className="text-xs text-[var(--muted)]">
              Owner: {account.owner.username}
              {account.territory_name ? ` · Territory: ${account.territory_name}` : ""}
            </p>
            <CustomFieldsPanel
              entity="account"
              values={account.custom_fields || {}}
              disabled={busy}
              onSave={(patch) => saveField({ custom_fields: { ...(account.custom_fields || {}), ...patch } })}
            />
          </div>

          {user?.role === "MANAGER" ? (
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">Merge duplicate</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Absorb another account into this one (re-points contacts & deals).</p>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="Loser account ID"
                  value={mergeLoser}
                  onChange={(e) => setMergeLoser(e.target.value)}
                />
                <Button disabled={busy || !mergeLoser.trim()} onClick={mergeAccounts}>
                  Merge
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Contacts</h2>
            <div className="mt-3 space-y-2">
              {contacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 transition hover:border-[var(--cyan)]"
                >
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-[var(--muted)]">{c.email}</div>
                  </div>
                  <span className="text-xs text-[var(--muted)]">{c.title || "—"}</span>
                </Link>
              ))}
              {contacts.length === 0 ? <Empty>No contacts yet.</Empty> : null}
            </div>

            <form
              className="mt-4 grid gap-2 border-t border-[var(--line)] pt-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                createContact(false);
              }}
            >
              <Input
                placeholder="Name"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                required
              />
              <Input
                placeholder="Email"
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                required
              />
              <Input
                placeholder="Title"
                value={contactForm.title}
                onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })}
              />
              <Input
                placeholder="Phone"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              />
              <div className="sm:col-span-2">
                {dupes.length ? (
                  <DuplicateSuspects
                    suspects={dupes}
                    busy={busy}
                    onCreateAnyway={() => createContact(true)}
                    onCancel={() => setDupes([])}
                  />
                ) : (
                  <Button type="submit" disabled={busy}>
                    Add contact
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Opportunities</h2>
            <div className="mt-3 space-y-2">
              {opps.map((o) => (
                <Link
                  key={o.id}
                  href={`/opportunities/${o.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 transition hover:border-[var(--cyan)]"
                >
                  <div>
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-[var(--muted)]">{o.owner.username}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{o.stage}</Badge>
                    <Money value={o.amount} />
                  </div>
                </Link>
              ))}
              {opps.length === 0 ? <Empty>No opportunities.</Empty> : null}
            </div>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Timeline</h2>
            <div className="mt-3">
              <TimelineFeed scope={{ account: Number(params.id) }} refreshKey={timelineKey} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
