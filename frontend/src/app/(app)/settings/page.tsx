"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Empty } from "@/components/ui";

/** Legacy path — Admin hub lives at /admin. */
export default function SettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return <Empty>Redirecting to Admin…</Empty>;
}
