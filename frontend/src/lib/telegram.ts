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

export type TelegramBackButton = {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
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
  BackButton?: TelegramBackButton;
  themeParams?: Record<string, string>;
  colorScheme?: "light" | "dark";
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  };
};

/** In-app parent for Telegram BackButton / browser back affordance. null = hide. */
export function tmaBackHref(pathname: string): string | null {
  if (pathname === "/tma" || pathname === "/tma/link") return null;
  if (/^\/tma\/leads\/[^/]+$/.test(pathname)) return "/tma/leads";
  if (pathname === "/tma/leads") return "/tma";
  if (/^\/tma\/opportunities\/[^/]+$/.test(pathname)) return "/tma/pipeline";
  if (pathname === "/tma/pipeline") return "/tma";
  if (/^\/tma\/schedule\/[^/]+$/.test(pathname)) return "/tma/schedule";
  if (pathname === "/tma/schedule") return "/tma";
  if (/^\/tma\/clients\/(accounts|contacts)\/[^/]+$/.test(pathname)) return "/tma/clients";
  if (pathname === "/tma/clients" || pathname.startsWith("/tma/clients/")) return "/tma";
  if (pathname.startsWith("/tma/")) return "/tma";
  return null;
}

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

/** Bot username from NEXT_PUBLIC_TELEGRAM_BOT_USERNAME (no @). Empty if unset. */
export function telegramBotUsername(): string {
  const raw = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  return raw.replace(/^@/, "").trim();
}

/** `https://t.me/<bot>` or with `?startapp=` when username is configured. */
export function telegramBotHref(startapp?: string): string {
  const user = telegramBotUsername();
  if (!user) return "";
  if (startapp) {
    return `https://t.me/${user}?startapp=${encodeURIComponent(startapp)}`;
  }
  return `https://t.me/${user}`;
}
