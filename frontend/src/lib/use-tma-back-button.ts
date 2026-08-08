"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getTelegramWebApp, tmaBackHref } from "@/lib/telegram";

/** Sync Telegram WebApp BackButton with in-app parent routes. */
export function useTmaBackButton(pathname: string, enabled: boolean) {
  const router = useRouter();
  const href = enabled ? tmaBackHref(pathname) : null;

  useEffect(() => {
    const wa = getTelegramWebApp();
    const back = wa?.BackButton;
    if (!back) return;

    const onClick = () => {
      if (href) router.push(href);
    };

    back.onClick(onClick);
    if (href) back.show();
    else back.hide();

    return () => {
      back.offClick(onClick);
      back.hide();
    };
  }, [href, router]);
}
