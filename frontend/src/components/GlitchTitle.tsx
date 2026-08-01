"use client";

import { useEffect, useState } from "react";

type Slice = {
  clip: string;
  x: number;
  opacity: number;
};

const IDLE: Slice = { clip: "inset(0 0 0 0)", x: 0, opacity: 0 };

function randSlice(channel: "magenta" | "cyan"): Slice {
  const top = Math.floor(Math.random() * 70);
  const height = 8 + Math.floor(Math.random() * 28);
  const bottom = Math.max(0, 100 - top - height);
  const x =
    channel === "magenta"
      ? -(2 + Math.floor(Math.random() * 8))
      : 2 + Math.floor(Math.random() * 8);
  return {
    clip: `inset(${top}% 0 ${bottom}% 0)`,
    x,
    opacity: 0.55 + Math.random() * 0.4,
  };
}

export function GlitchTitle({ text }: { text: string }) {
  const [magenta, setMagenta] = useState<Slice>(IDLE);
  const [cyan, setCyan] = useState<Slice>(IDLE);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const tick = () => {
      if (cancelled) return;

      // Slow, sparse bursts — mostly calm, then a short tear
      const burst = Math.random() < 0.35;
      if (burst) {
        setMagenta(randSlice("magenta"));
        setCyan(randSlice("cyan"));
        setShake((Math.random() - 0.5) * 3);
        timeoutId = window.setTimeout(() => {
          if (cancelled) return;
          setMagenta(IDLE);
          setCyan(IDLE);
          setShake(0);
          timeoutId = window.setTimeout(tick, 1800 + Math.random() * 2800);
        }, 120 + Math.random() * 220);
      } else {
        // Soft channel drift without hard clips
        setMagenta({
          clip: "inset(0 0 0 0)",
          x: -(1 + Math.random() * 2),
          opacity: 0.2 + Math.random() * 0.15,
        });
        setCyan({
          clip: "inset(0 0 0 0)",
          x: 1 + Math.random() * 2,
          opacity: 0.2 + Math.random() * 0.15,
        });
        setShake(0);
        timeoutId = window.setTimeout(() => {
          if (cancelled) return;
          setMagenta(IDLE);
          setCyan(IDLE);
          timeoutId = window.setTimeout(tick, 2200 + Math.random() * 3200);
        }, 400 + Math.random() * 500);
      }
    };

    timeoutId = window.setTimeout(tick, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <h1
      className="vapor-about__title"
      style={{ transform: `translateX(${shake}px)` }}
      data-text={text}
    >
      <span className="vapor-about__title-base">{text}</span>
      <span
        className="vapor-about__title-channel vapor-about__title-channel--magenta"
        aria-hidden
        style={{
          clipPath: magenta.clip,
          transform: `translateX(${magenta.x}px)`,
          opacity: magenta.opacity,
        }}
      >
        {text}
      </span>
      <span
        className="vapor-about__title-channel vapor-about__title-channel--cyan"
        aria-hidden
        style={{
          clipPath: cyan.clip,
          transform: `translateX(${cyan.x}px)`,
          opacity: cyan.opacity,
        }}
      >
        {text}
      </span>
    </h1>
  );
}
