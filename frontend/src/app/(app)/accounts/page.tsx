"use client";

import { useEffect, useState } from "react";
import { Card, Empty, PageHeader } from "@/components/ui";
import { apiList } from "@/lib/api";
import type { Account, Contact } from "@/lib/types";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([apiList<Account>("/api/accounts/"), apiList<Contact>("/api/contacts/")])
      .then(([a, c]) => {
        setAccounts(a);
        setContacts(c);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <PageHeader title="Accounts & contacts" subtitle="Company records created from lead conversion or manually." />
      {error ? <p className="mb-3 text-sm text-[#b42318]">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-x-auto">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Accounts</h2>
          <table className="mt-3">
            <thead>
              <tr>
                <th>Name</th>
                <th>Domain</th>
                <th>Industry</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.domain}</td>
                  <td>{a.industry}</td>
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
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.title}</td>
                  <td>{c.account_name}</td>
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
