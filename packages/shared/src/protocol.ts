export type Lang = "en" | "es";
export type Health = "idle" | "connecting" | "live" | "reconnecting" | "ended" | "error";

/**
 * Wall-clock timestamps (server clock, ms) for one caption segment.
 * audioSentAt is the send time of the last audio chunk before the transcript
 * arrived, so transcriptReceivedAt - audioSentAt is a lower bound of STT lag.
 */
export interface SegmentLatency {
  audioSentAt: number;
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
  /** STT lag lower bound: last audio chunk sent → sentence committed */
  sttP50: number | null;
  /** Translation round-trip: sentence committed → Spanish received */
  mtP50: number | null;
  mtP95: number | null;
  /** Pipeline: last audio chunk sent → Spanish received */
  totalP50: number | null;
  totalP95: number | null;
  last: number | null;
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
