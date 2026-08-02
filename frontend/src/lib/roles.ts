import type { Role } from "@/lib/types";

/** Professional display labels — permission checks still use Role codes. */
export const ROLE_LABELS: Record<Role, string> = {
  SDR: "Sales Development",
  AE: "Account Executive",
  MANAGER: "Sales Manager",
};

export const ROLE_BLURBS: Record<Role, string> = {
  SDR: "Qualify leads and convert to deals",
  AE: "Own pipeline and log activities",
  MANAGER: "Admin hub, forecast, routing, and team",
};

export function roleLabel(role: Role | string): string {
  return ROLE_LABELS[role as Role] ?? role;
}
