"use client";

import Script from "next/script";
import type { ReactNode } from "react";
import { TmaShell } from "@/components/tma/TmaShell";
import { TmaAuthProvider } from "@/lib/tma-auth";

export default function TmaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <TmaAuthProvider>
        <TmaShell>{children}</TmaShell>
      </TmaAuthProvider>
    </>
  );
}
