"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, clearTokens, setTokens } from "@/lib/api";
import {
  bootstrapTelegramWebApp,
  deepLinkHref,
  getInitData,
  getStartParam,
  parseStartParam,
  type TelegramWebAppUser,
} from "@/lib/telegram";
import type { User } from "@/lib/types";

type TelegramAuthOk = {
  needs_link: false;
  access: string;
  refresh: string;
  user: User;
};

type TelegramAuthNeedsLink = {
  needs_link: true;
  telegram_user: TelegramWebAppUser;
};

type TelegramAuthResponse = TelegramAuthOk | TelegramAuthNeedsLink;

type TmaPhase =
  | { kind: "booting" }
  | { kind: "needs_link"; telegramUser: TelegramWebAppUser }
  | { kind: "ready"; user: User }
  | { kind: "error"; message: string };

type TmaAuthState = {
  phase: TmaPhase;
  linkAccount: (username: string, password: string) => Promise<void>;
  unlinkAccount: () => Promise<void>;
  retry: () => void;
};

const TmaAuthContext = createContext<TmaAuthState | null>(null);

function isNeedsLink(data: TelegramAuthResponse): data is TelegramAuthNeedsLink {
  return data.needs_link === true;
}

export function TmaAuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<TmaPhase>({ kind: "booting" });
  const [bootKey, setBootKey] = useState(0);
  const deepLinkHandled = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  const applySession = useCallback((user: User, access: string, refresh: string) => {
    setTokens(access, refresh);
    setPhase({ kind: "ready", user });
  }, []);

  const boot = useCallback(async () => {
    setPhase({ kind: "booting" });
    bootstrapTelegramWebApp();

    const initData = getInitData();
    if (!initData) {
      // Browser/dev: reuse an existing JWT if present
      const existing = typeof window !== "undefined" ? localStorage.getItem("pipelinehq_access") : null;
      if (existing) {
        try {
          const me = await api<User>("/api/auth/me/");
          setPhase({ kind: "ready", user: me });
          return;
        } catch {
          clearTokens();
        }
      }
      setPhase({
        kind: "error",
        message: "Open this Mini App from Telegram (Telegram.WebApp.initData is missing).",
      });
      return;
    }

    try {
      const data = await api<TelegramAuthResponse>("/api/telegram/auth/", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ init_data: initData }),
      });
      if (isNeedsLink(data)) {
        setPhase({ kind: "needs_link", telegramUser: data.telegram_user });
        return;
      }
      applySession(data.user, data.access, data.refresh);
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Telegram auth failed",
      });
    }
  }, [applySession]);

  useEffect(() => {
    void boot();
  }, [boot, bootKey]);

  useEffect(() => {
    if (phase.kind === "needs_link" && pathname !== "/tma/link") {
      router.replace("/tma/link");
    }
  }, [phase, pathname, router]);

  useEffect(() => {
    if (phase.kind !== "ready" || deepLinkHandled.current) return;
    const link = parseStartParam(getStartParam());
    deepLinkHandled.current = true;
    if (!link) return;
    const href = deepLinkHref(link);
    if (pathname !== href) router.replace(href);
  }, [phase.kind, pathname, router]);

  const linkAccount = useCallback(
    async (username: string, password: string) => {
      const initData = getInitData();
      if (!initData) {
        throw new Error("Telegram initData is missing.");
      }
      const data = await api<TelegramAuthOk>("/api/telegram/link/", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ init_data: initData, username, password }),
      });
      applySession(data.user, data.access, data.refresh);
      router.replace("/tma");
    },
    [applySession, router],
  );

  const unlinkAccount = useCallback(async () => {
    await api<{ detail: string }>("/api/telegram/unlink/", { method: "POST" });
    clearTokens();
    deepLinkHandled.current = false;
    setBootKey((k) => k + 1);
  }, []);

  const retry = useCallback(() => {
    deepLinkHandled.current = false;
    setBootKey((k) => k + 1);
  }, []);

  const value = useMemo(
    () => ({ phase, linkAccount, unlinkAccount, retry }),
    [phase, linkAccount, unlinkAccount, retry],
  );

  return <TmaAuthContext.Provider value={value}>{children}</TmaAuthContext.Provider>;
}

export function useTmaAuth() {
  const ctx = useContext(TmaAuthContext);
  if (!ctx) throw new Error("useTmaAuth must be used within TmaAuthProvider");
  return ctx;
}
