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
}

export type ClientMsg =
  | { t: "subscribe"; sessionId: string }
  | { t: "unsubscribe"; sessionId: string }
  | { t: "watchSessions" };

export type ServerMsg =
  | { t: "sessions"; list: SessionSummary[]; serverTime: number }
  | { t: "snapshot"; sessionId: string; summary: SessionSummary; segments: Segment[]; interim: string }
  | { t: "interim"; sessionId: string; text: string }
  | { t: "final"; sessionId: string; seg: Segment }
  | { t: "translation"; sessionId: string; segId: number; es: string; translationReceivedAt: number }
  | { t: "health"; sessionId: string; health: Health }
  | { t: "error"; message: string };
