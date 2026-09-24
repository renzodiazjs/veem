export type Lang = "en" | "es";
export type Health = "idle" | "connecting" | "live" | "reconnecting" | "ended" | "error";

/**
 * Wall-clock timestamps (server clock, ms) for one caption segment.
 * speechEndAt is set only for segments flushed at the end of an utterance: it is
 * the send time of the last voiced audio chunk (local energy detection), which
 * is the one point where "speech → caption" can be measured honestly.
 */
export interface SegmentLatency {
  speechEndAt?: number;
  transcriptReceivedAt: number;
  translationReceivedAt?: number;
}

export interface Segment {
  id: number;
  /** Position in the session's audio (ms since the session started), for VTT/SRT export */
  startMs: number;
  endMs: number;
  en: string;
  es?: string;
  lat: SegmentLatency;
}

export interface LatencyStats {
  /** End of speech → English caption (utterance-end segments only) */
  enP50: number | null;
  enP95: number | null;
  /** End of speech → Spanish caption (utterance-end segments only) */
  esP50: number | null;
  esP95: number | null;
  /** Translation round-trip for every segment: EN committed → ES received */
  mtP50: number | null;
  mtP95: number | null;
  samples: number;
}

/** Technical Context Engine A/B: same audio transcribed with and without the talk context. */
export interface ContextComparison {
  /** Glossary term mentions recognized in the context-aware transcript */
  withContext: number;
  /** Glossary term mentions recognized in the baseline (no context) transcript */
  withoutContext: number;
  /** Per-term counts: [term, withContext, withoutContext] */
  byTerm: [string, number, number][];
}

export interface SessionSummary {
  id: string;
  title: string;
  room: string;
  speaker?: string;
  health: Health;
  segmentCount: number;
  glossary: string[];
  startedAt: number | null;
  reconnects: number;
  latency: LatencyStats;
  comparison: ContextComparison | null;
}

export type ClientMsg =
  | { t: "subscribe"; sessionId: string }
  | { t: "unsubscribe"; sessionId: string }
  | { t: "watchSessions" };

export type ServerMsg =
  | { t: "sessions"; list: SessionSummary[]; serverTime: number; lanHosts: string[] }
  | { t: "snapshot"; sessionId: string; summary: SessionSummary; segments: Segment[]; interim: string; baseline: { id: number; text: string }[] }
  | { t: "interim"; sessionId: string; text: string }
  | { t: "final"; sessionId: string; seg: Segment }
  | { t: "translation"; sessionId: string; segId: number; es: string; translationReceivedAt: number }
  | { t: "health"; sessionId: string; health: Health }
  /** Baseline transcript line (no context) — only when compareBaseline is on */
  | { t: "baseline"; sessionId: string; id: number; text: string }
  | { t: "error"; message: string };
