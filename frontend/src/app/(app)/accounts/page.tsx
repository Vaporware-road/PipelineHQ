"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Empty, PageHeader, Select } from "@/components/ui";
import { apiList } from "@/lib/api";
import type { Account, Contact, Territory } from "@/lib/types";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [territory, setTerritory] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiList<Territory>("/api/territories/")
      .then(setTerritories)
      .catch(() => setTerritories([]));
  }, []);

  useEffect(() => {
    const qs = territory ? `?territory=${territory}` : "";
    Promise.all([apiList<Account>(`/api/accounts/${qs}`), apiList<Contact>("/api/contacts/")])
      .then(([a, c]) => {
        setAccounts(a);
        setContacts(c);
      })
      .catch((e) => setError(e.message));
  }, [territory]);

  return (
    <div>
      <PageHeader
        title="Accounts & contacts"
        subtitle="Company records created from lead conversion or manually."
        actions={
          territories.length ? (
            <Select value={territory} onChange={(e) => setTerritory(e.target.value)}>
              <option value="">All territories</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-x-auto">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Accounts</h2>
          <table className="mt-3">
            <thead>
              <tr>
                <th>Name</th>
                <th>Domain</th>
                <th>Industry</th>
                <th>Territory</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/accounts/${a.id}`} className="text-[var(--cyan)] hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td>{a.domain || "—"}</td>
                  <td>{a.industry || "—"}</td>
                  <td>{a.territory_name || "—"}</td>
                  <td>{a.owner.username}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {accounts.length === 0 ? <Empty>No accounts.</Empty> : null}
        </Card>
        <Card className="overflow-x-auto">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Contacts</h2>
          <table className="mt-3">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Title</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/contacts/${c.id}`} className="text-[var(--cyan)] hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.email}</td>
                  <td>{c.title || "—"}</td>
                  <td>
                    <Link href={`/accounts/${c.account}`} className="text-[var(--cyan)] hover:underline">
                      {c.account_name}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {contacts.length === 0 ? <Empty>No contacts.</Empty> : null}
        </Card>
      </div>
    </div>
  );
}
