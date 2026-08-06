"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Empty = same-origin HTTP via Next rewrite; WS still needs a direct Django origin. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function wsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (!API_URL) {
    if (typeof window !== "undefined") {
      // Desktop/local: API is proxied; Daphne WS is still on :8000.
      const { protocol, hostname } = window.location;
      const wsProto = protocol === "https:" ? "wss:" : "ws:";
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return `${wsProto}//${hostname}:8000`;
      }
    }
    return "ws://127.0.0.1:8000";
  }
  try {
    const u = new URL(API_URL);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.origin;
  } catch {
    return "ws://127.0.0.1:8000";
  }
}

export type RealtimeMessage = {
  event: string;
  payload: Record<string, unknown>;
};

/**
 * JWT WebSocket to /ws/realtime/?token=…
 * Falls back silently — callers should keep HTTP polling when !connected.
 */
export function useRealtime(onMessage?: (msg: RealtimeMessage) => void) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  const reconnect = useCallback(() => {
    /* reconnect handled inside effect via closed socket */
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: number | undefined;
    let attempt = 0;

    function connect() {
      if (closed) return;
      const token = typeof window !== "undefined" ? localStorage.getItem("pipelinehq_access") : null;
      if (!token) {
        setConnected(false);
        return;
      }
      const url = `${wsUrl()}/ws/realtime/?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      socket.onclose = () => {
        setConnected(false);
        if (closed) return;
        // Cap backoff; avoid hammering Daphne when Redis/channel layer flaps.
        const delay = Math.min(30_000, 3000 * 2 ** Math.min(attempt, 4));
        attempt += 1;
        retry = window.setTimeout(connect, delay);
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as RealtimeMessage;
          handlerRef.current?.(data);
        } catch {
          /* ignore malformed */
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return { connected, reconnect };
}
