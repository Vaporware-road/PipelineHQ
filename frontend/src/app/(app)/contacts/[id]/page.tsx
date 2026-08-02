"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TimelineFeed } from "@/components/TimelineFeed";
import { CustomFieldsPanel } from "@/components/CustomFieldsPanel";
import { Badge, Button, Card, Empty, Input, Money, PageHeader } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Contact, Opportunity } from "@/lib/types";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [contact, setContact] = useState<Contact | null>(null);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [mergeLoser, setMergeLoser] = useState("");

  async function load() {
    try {
      const c = await api<Contact>(`/api/contacts/${params.id}/`);
      setContact(c);
      const all = await apiList<Opportunity>(`/api/opportunities/?account=${c.account}`);
      setOpps(all.filter((o) => o.primary_contact === c.id || o.account === c.account));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contact");
    }
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function saveField(patch: Partial<Contact>) {
    setBusy(true);
    setError("");
    try {
      setContact(await api<Contact>(`/api/contacts/${params.id}/`, { method: "PATCH", body: JSON.stringify(patch) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function mergeContacts() {
    if (!mergeLoser.trim() || !contact) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/duplicates/merge/", {
        method: "POST",
        body: JSON.stringify({
          entity_type: "contact",
          winner_id: contact.id,
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

  if (!contact) {
    return (
      <div>
        <PageHeader title="Contact" subtitle="Loading…" />
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : <Empty>Loading contact…</Empty>}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={contact.name}
        subtitle={`${contact.title || "Contact"} · ${contact.email}`}
        actions={
          <Link href={`/accounts/${contact.account}`} className="text-sm text-[var(--cyan)] hover:underline">
            ← {contact.account_name}
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
                defaultValue={contact.name}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== contact.name) saveField({ name: e.target.value });
                }}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                defaultValue={contact.email}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== contact.email) saveField({ email: e.target.value });
                }}
              />
            </Field>
            <Field label="Title">
              <Input
                defaultValue={contact.title}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== contact.title) saveField({ title: e.target.value });
                }}
              />
            </Field>
            <Field label="Phone">
              <Input
                defaultValue={contact.phone}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== contact.phone) saveField({ phone: e.target.value });
                }}
              />
            </Field>
            <CustomFieldsPanel
              entity="contact"
              values={contact.custom_fields || {}}
              disabled={busy}
              onSave={(patch) => saveField({ custom_fields: { ...(contact.custom_fields || {}), ...patch } })}
            />
          </div>

          {user?.role === "MANAGER" ? (
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">Merge duplicate</h3>
              <div className="mt-2 flex gap-2">
                <Input placeholder="Loser contact ID" value={mergeLoser} onChange={(e) => setMergeLoser(e.target.value)} />
                <Button disabled={busy || !mergeLoser.trim()} onClick={mergeContacts}>
                  Merge
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Related opportunities</h2>
            <div className="mt-3 space-y-2">
              {opps
                .filter((o) => o.primary_contact === contact.id)
                .map((o) => (
                  <Link
                    key={o.id}
                    href={`/opportunities/${o.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2 transition hover:border-[var(--cyan)]"
                  >
                    <span className="font-medium">{o.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge>{o.stage}</Badge>
                      <Money value={o.amount} />
                    </div>
                  </Link>
                ))}
              {opps.filter((o) => o.primary_contact === contact.id).length === 0 ? (
                <Empty>No deals with this primary contact.</Empty>
              ) : null}
            </div>
          </Card>

          <Card>
            <h2 className="font-[family-name:var(--font-display)] text-lg">Timeline</h2>
            <div className="mt-3">
              <TimelineFeed scope={{ contact: Number(params.id) }} refreshKey={timelineKey} />
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
