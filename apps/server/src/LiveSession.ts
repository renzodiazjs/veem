import type { WebSocket } from "ws";
import type { Health, Segment, ServerMsg, SessionSummary } from "@veem/shared";
import { CHUNK_BYTES, FileSource, type AudioSource } from "./audio/FileSource";
import { GeminiTranscriber, type SpeechProvider } from "./providers/GeminiTranscriber";
import type { Translator } from "./providers/Translator";
import { SentenceSegmenter } from "./SentenceSegmenter";
import { rms, SPEECH_RMS } from "./audio/energy";
import { LatencyTracker } from "./metrics";
import type { SessionConfig } from "./config";

const MAX_SEGMENTS = 500;
const TRANSLATION_CONTEXT = 2;
/** Drop interim updates for clients whose send buffer is backed up (bytes). */
const SLOW_CLIENT_BYTES = 1_000_000;

export class LiveSession {
  readonly id: string;
  private health: Health = "idle";
  private segments: Segment[] = [];
  private interim = "";
  private nextSegId = 1;
  private startedAt: number | null = null;
  private reconnects = 0;
  /** Send time of the most recent chunk that contained speech. */
  private lastVoicedAt = 0;
  /** Bumped on every start so late callbacks from a previous run are ignored. */
  private runId = 0;

  private source?: AudioSource;
  private stt?: SpeechProvider;
  private readonly segmenter = new SentenceSegmenter();
  private readonly latency = new LatencyTracker();
  readonly subscribers = new Set<WebSocket>();

  constructor(private readonly config: SessionConfig, private readonly translator: Translator) {
    this.id = config.id;
  }

  summary(): SessionSummary {
    return {
      id: this.config.id,
      title: this.config.title,
      room: this.config.room,
      speaker: this.config.speaker,
      health: this.health,
      segmentCount: this.nextSegId - 1,
      glossary: this.config.glossary,
      startedAt: this.startedAt,
      reconnects: this.reconnects,
      latency: this.latency.stats(),
    };
  }

  snapshot(): ServerMsg {
    return { t: "snapshot", sessionId: this.id, summary: this.summary(), segments: this.segments, interim: this.interim };
  }

  async start() {
    this.stop();
    const run = ++this.runId;
    this.segments = [];
    this.interim = "";
    this.nextSegId = 1;
    this.reconnects = 0;
    this.segmenter.reset();
    this.latency.reset();
    this.startedAt = Date.now();
    this.setHealth("connecting");
    this.broadcast(this.snapshot());

    const stt = new GeminiTranscriber({ languageCodes: [this.config.language], vocabulary: this.config.glossary });
    this.stt = stt;
    stt.on("interim", (text: string) => run === this.runId && this.onInterim(text));
    stt.on("final", (text: string) => run === this.runId && this.onFinal(text));
    stt.on("open", () => run === this.runId && this.setHealth("live"));
    stt.on("reconnecting", () => {
      if (run !== this.runId) return;
      this.reconnects++;
      this.setHealth("reconnecting");
    });
    stt.on("error", (err: Error) => console.error(`[${this.id}] stt error:`, err.message));

    try {
      await stt.connect();
    } catch (err) {
      console.error(`[${this.id}] could not connect:`, (err as Error).message);
      this.setHealth("error");
      return;
    }
    if (run !== this.runId) return;

    const source = new FileSource(this.config.source.path, this.config.source.startAtSec);
    this.source = source;
    source.on("chunk", (pcm: Buffer) => {
      if (rms(pcm) > SPEECH_RMS) this.lastVoicedAt = Date.now();
      stt.send(pcm);
    });
    source.on("error", (err: Error) => {
      console.error(`[${this.id}] audio error:`, err.message);
      this.setHealth("error");
    });
    source.on("end", () => this.onAudioEnd(run));
    source.start();
  }

  stop() {
    this.runId++;
    this.source?.stop();
    this.stt?.close();
    this.source = undefined;
    this.stt = undefined;
    if (this.health !== "idle") this.setHealth("ended");
  }

  private async onAudioEnd(run: number) {
    if (this.config.source.loop) {
      this.source?.start();
      return;
    }
    // Feed silence so voice activity detection closes the last utterance.
    const silence = Buffer.alloc(CHUNK_BYTES);
    for (let i = 0; i < 20 && run === this.runId; i++) {
      this.stt?.send(silence);
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 5000));
    if (run !== this.runId) return;
    this.stt?.close();
    this.stt = undefined;
    this.source = undefined;
    this.setHealth("ended");
  }

  private onInterim(text: string) {
    const { commits, pending } = this.segmenter.interim(text);
    commits.forEach((s) => this.commit(s, false));
    this.setInterim(pending);
  }

  private onFinal(text: string) {
    const { commits } = this.segmenter.final(text);
    // Only the last sentence of an utterance ends where the speech ended.
    commits.forEach((s, i) => this.commit(s, i === commits.length - 1));
    this.setInterim("");
  }

  private setInterim(text: string) {
    if (text === this.interim) return;
    this.interim = text;
    this.broadcast({ t: "interim", sessionId: this.id, text }, true);
  }

  private commit(en: string, utteranceEnd: boolean) {
    const now = Date.now();
    const seg: Segment = {
      id: this.nextSegId++,
      en,
      lat: {
        transcriptReceivedAt: now,
        ...(utteranceEnd && this.lastVoicedAt && now - this.lastVoicedAt < 10_000 ? { speechEndAt: this.lastVoicedAt } : {}),
      },
    };
    const context = this.segments.slice(-TRANSLATION_CONTEXT).map((s) => s.en);
    this.segments.push(seg);
    if (this.segments.length > MAX_SEGMENTS) this.segments.shift();
    this.latency.recordTranscript(seg);
    this.broadcast({ t: "final", sessionId: this.id, seg });
    this.translate(seg, context, this.runId);
  }

  private async translate(seg: Segment, context: string[], run: number) {
    try {
      const es = await this.translator.translate({
        text: seg.en,
        context,
        glossary: this.config.glossary,
        talkTitle: this.config.title,
      });
      if (run !== this.runId || !es) return;
      seg.es = es;
      seg.lat.translationReceivedAt = Date.now();
      this.latency.recordTranslation(seg);
      this.broadcast({ t: "translation", sessionId: this.id, segId: seg.id, es, translationReceivedAt: seg.lat.translationReceivedAt });
    } catch (err) {
      console.error(`[${this.id}] translation failed for seg ${seg.id}:`, (err as Error).message);
    }
  }

  private setHealth(health: Health) {
    if (health === this.health) return;
    this.health = health;
    this.broadcast({ t: "health", sessionId: this.id, health });
  }

  broadcast(msg: ServerMsg, droppable = false) {
    const data = JSON.stringify(msg);
    for (const ws of this.subscribers) {
      if (ws.readyState !== ws.OPEN) continue;
      if (droppable && ws.bufferedAmount > SLOW_CLIENT_BYTES) continue;
      ws.send(data);
    }
  }
}
