import type { Metadata } from "next";
import Link from "next/link";
import { GlitchTitle } from "@/components/GlitchTitle";

export const metadata: Metadata = {
  title: "About · Vaporware-Road",
  description: "Every product is an opportunity to leave a lasting mark.",
};

const GITHUB = "https://github.com/Vaporware-road";

export default function AboutPage() {
  return (
    <main className="vapor-about">
      <div className="vapor-about__space" aria-hidden />
      <div className="vapor-about__nebula" aria-hidden />
      <div className="vapor-about__stars" aria-hidden />
      <div className="vapor-about__grid" aria-hidden />
      <div className="vapor-about__crt" aria-hidden />
      <div className="vapor-about__scan" aria-hidden />

      <div className="vapor-about__frame">
        <p className="vapor-about__tag">
          Every product is an opportunity to leave a lasting mark.
        </p>

        <GlitchTitle text="Vaporware-Road" />

        <nav className="vapor-about__links">
          <a href={GITHUB} target="_blank" rel="noopener noreferrer">
            GitHub // Vaporware-road
          </a>
          <Link href="/login">Enter PipelineHQ</Link>
          <Link href="/dashboard">Back to app</Link>
        </nav>
      </div>
    </main>
  );
}
