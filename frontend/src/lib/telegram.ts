/**
 * Telegram WebApp helpers for the Mini App shell.
 * Loads from https://telegram.org/js/telegram-web-app.js
 */

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    start_param?: string;
    auth_date?: number;
    hash?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  themeParams?: Record<string, string>;
  colorScheme?: "light" | "dark";
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function bootstrapTelegramWebApp(): TelegramWebApp | null {
  const wa = getTelegramWebApp();
  if (!wa) return null;
  wa.ready();
  wa.expand();
  return wa;
}

export function getInitData(): string {
  return getTelegramWebApp()?.initData ?? "";
}

export function getStartParam(): string {
  const wa = getTelegramWebApp();
  if (wa?.initDataUnsafe?.start_param) return wa.initDataUnsafe.start_param;
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("tgWebAppStartParam") || params.get("startapp") || "";
}

export type TmaDeepLink =
  | { kind: "lead"; id: number }
  | { kind: "opportunity"; id: number }
  | { kind: "meeting"; id: number };

export function parseStartParam(raw: string): TmaDeepLink | null {
  const value = raw.trim();
  if (!value) return null;
  const match = /^(lead|opp|opportunity|meeting)_(\d+)$/i.exec(value);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isFinite(id) || id <= 0) return null;
  const prefix = match[1].toLowerCase();
  if (prefix === "lead") return { kind: "lead", id };
  if (prefix === "opp" || prefix === "opportunity") return { kind: "opportunity", id };
  if (prefix === "meeting") return { kind: "meeting", id };
  return null;
}

export function deepLinkHref(link: TmaDeepLink): string {
  switch (link.kind) {
    case "lead":
      return `/tma/leads/${link.id}`;
    case "opportunity":
      return `/tma/opportunities/${link.id}`;
    case "meeting":
      return `/tma/schedule/${link.id}`;
    default: {
      const _exhaustive: never = link;
      return _exhaustive;
    }
  }
}
