"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientMsg, Health, Segment, ServerMsg, SessionSummary } from "@veem/shared";

export function serverHttpUrl() {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  if (typeof window === "undefined") return "http://localhost:8080";
  return `${window.location.protocol}//${window.location.hostname}:8080`;
}

function wsUrl() {
  return serverHttpUrl().replace(/^http/, "ws") + "/ws";
}

/**
 * One WebSocket per hook instance, with jittered exponential reconnect.
 * On every (re)connect the `onOpen` messages are re-sent, and the server
 * answers subscriptions with a full snapshot, so state never drifts.
 */
function useSocket(onOpen: ClientMsg[], onMessage: (msg: ServerMsg) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const openMsgs = JSON.stringify(onOpen);

  useEffect(() => {
    let ws: WebSocket | undefined;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;

    const connect = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        for (const m of JSON.parse(openMsgs) as ClientMsg[]) ws!.send(JSON.stringify(m));
      };
      ws.onmessage = (e) => handler.current(JSON.parse(e.data) as ServerMsg);
      ws.onclose = () => {
        setConnected(false);
        if (disposed) return;
        const delay = Math.min(8000, 500 * 2 ** attempt++) * (0.75 + Math.random() * 0.5);
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [openMsgs]);

  return connected;
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const connected = useSocket([{ t: "watchSessions" }], (msg) => {
    if (msg.t === "sessions") setSessions(msg.list);
  });
  return { sessions, connected };
}

export interface CaptionState {
  summary?: SessionSummary;
  health: Health;
  segments: Segment[];
  interim: string;
  error?: string;
}

const MAX_CLIENT_SEGMENTS = 200;

export function useCaptions(sessionId: string) {
  const [state, setState] = useState<CaptionState>({ health: "idle", segments: [], interim: "" });

  const connected = useSocket([{ t: "subscribe", sessionId }, { t: "watchSessions" }], (msg) => {
    if (msg.t === "sessions") {
      const summary = msg.list.find((s) => s.id === sessionId);
      if (summary) setState((s) => ({ ...s, summary, health: summary.health }));
      return;
    }
    if (msg.t === "error") return setState((s) => ({ ...s, error: msg.message }));
    if (!("sessionId" in msg) || msg.sessionId !== sessionId) return;

    setState((s) => {
      switch (msg.t) {
        case "snapshot":
          return { summary: msg.summary, health: msg.summary.health, segments: msg.segments.slice(-MAX_CLIENT_SEGMENTS), interim: msg.interim };
        case "interim":
          return { ...s, interim: msg.text };
        case "final":
          if (s.segments.some((x) => x.id === msg.seg.id)) return s;
          return { ...s, segments: [...s.segments, msg.seg].slice(-MAX_CLIENT_SEGMENTS) };
        case "translation":
          return {
            ...s,
            segments: s.segments.map((x) =>
              x.id === msg.segId ? { ...x, es: msg.es, lat: { ...x.lat, translationReceivedAt: msg.translationReceivedAt } } : x,
            ),
          };
        case "health":
          return { ...s, health: msg.health };
        default:
          return s;
      }
    });
  });

  return { ...state, connected };
}

export async function controlSession(id: string, action: "start" | "stop") {
  await fetch(`${serverHttpUrl()}/api/sessions/${id}/${action}`, { method: "POST" });
}

export const HEALTH_LABEL: Record<Health, { label: string; dot: string }> = {
  idle: { label: "Esperando", dot: "bg-zinc-500" },
  connecting: { label: "Conectando…", dot: "bg-amber-400 animate-pulse" },
  live: { label: "En vivo", dot: "bg-red-500 animate-pulse" },
  reconnecting: { label: "Reconectando…", dot: "bg-amber-400 animate-pulse" },
  ended: { label: "Finalizada", dot: "bg-zinc-500" },
  error: { label: "Error", dot: "bg-red-700" },
};

export function fmtMs(ms: number | null | undefined) {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
