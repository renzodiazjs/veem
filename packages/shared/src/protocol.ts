export type Lang = "en" | "es";
export type Health = "idle" | "connected" | "reconnecting" | "ended" | "error";

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

export interface SessionSummary {
  id: string;
  title: string;
  room: string;
  health: Health;
  segmentCount: number;
}

export type ClientMsg =
  | { t: "subscribe"; sessionId: string }
  | { t: "unsubscribe"; sessionId: string }
  | { t: "ack"; sessionId: string; segId: number; clientRenderedAt: number };

export type ServerMsg =
  | { t: "sessions"; list: SessionSummary[] }
  | { t: "snapshot"; sessionId: string; health: Health; segments: Segment[]; interim: string }
  | { t: "interim"; sessionId: string; text: string }
  | { t: "final"; sessionId: string; seg: Segment }
  | { t: "translation"; sessionId: string; segId: number; es: string; translationReceivedAt: number }
  | { t: "health"; sessionId: string; health: Health };
