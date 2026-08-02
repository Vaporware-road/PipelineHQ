"use client";

import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui";
import { apiList } from "@/lib/api";
import type { CustomFieldDefinition } from "@/lib/types";

type Values = Record<string, string | number | boolean | null | undefined>;

export function CustomFieldsPanel({
  entity,
  values,
  disabled,
  onSave,
}: {
  entity: CustomFieldDefinition["entity"];
  values: Values;
  disabled?: boolean;
  onSave: (patch: Record<string, string | number | boolean | null>) => void | Promise<void>;
}) {
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([]);
  const [local, setLocal] = useState<Values>(values);

  useEffect(() => {
    apiList<CustomFieldDefinition>(`/api/custom-fields/?entity=${entity}&is_active=true`)
      .then(setDefs)
      .catch(() => setDefs([]));
  }, [entity]);

  useEffect(() => {
    setLocal(values);
  }, [values]);

  if (defs.length === 0) return null;

  function commit(key: string, raw: string | boolean) {
    const def = defs.find((d) => d.key === key);
    if (!def) return;
    let next: string | number | boolean | null = raw as string;
    if (def.field_type === "number") {
      next = raw === "" ? null : Number(raw);
    } else if (def.field_type === "bool") {
      next = Boolean(raw);
    } else if (raw === "") {
      next = null;
    }
    const prev = local[key];
    if (prev === next || (prev == null && next == null)) return;
    setLocal((v) => ({ ...v, [key]: next }));
    void onSave({ [key]: next });
  }

  return (
    <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Custom fields</h3>
      {defs.map((def) => {
        const value = local[def.key];
        const label = (
          <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--muted)]">
            {def.label}
            {def.required ? " *" : ""}
          </label>
        );
        if (def.field_type === "bool") {
          return (
            <div key={def.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  disabled={disabled}
                  onChange={(e) => commit(def.key, e.target.checked)}
                />
                {def.label}
              </label>
            </div>
          );
        }
        if (def.field_type === "select") {
          return (
            <div key={def.id}>
              {label}
              <Select
                value={value == null ? "" : String(value)}
                disabled={disabled}
                onChange={(e) => commit(def.key, e.target.value)}
              >
                <option value="">—</option>
                {(def.options || []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            </div>
          );
        }
        return (
          <div key={def.id}>
            {label}
            <Input
              type={def.field_type === "number" ? "number" : def.field_type === "date" ? "date" : "text"}
              defaultValue={value == null ? "" : String(value)}
              key={`${def.key}:${value ?? ""}`}
              disabled={disabled}
              onBlur={(e) => commit(def.key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
