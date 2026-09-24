import type { WebSocket } from "ws";
import type { Health, Segment, ServerMsg, SessionSummary } from "@veem/shared";
import { CHUNK_BYTES, FileSource, type AudioSource } from "./audio/FileSource";
import { GeminiTranscriber, type SpeechProvider } from "./providers/GeminiTranscriber";
import type { Translator } from "./providers/Translator";
import { SentenceSegmenter } from "./SentenceSegmenter";
import { SpeechEndDetector } from "./audio/energy";
import { LatencyTracker } from "./metrics";
import { TermCounter } from "./context/termCounter";
import type { SessionConfig } from "./config";

const MAX_SEGMENTS = 500;
/** Full-talk archive for caption export (~10 KB per 100 segments). */
const MAX_ARCHIVE = 20_000;
const TRANSLATION_CONTEXT = 2;
const MAX_BASELINE_LINES = 100;
/** Average speaking rate used to lay sentences out on the audio timeline. */
const WORDS_PER_SEC = 2.7;
/** Typical lag between speech and an interim sentence becoming stable. */
const INTERIM_LAG_MS = 800;
/** Drop interim updates for clients whose send buffer is backed up (bytes). */
const SLOW_CLIENT_BYTES = 1_000_000;

export class LiveSession {
  readonly id: string;
  private health: Health = "idle";
  private segments: Segment[] = [];
  private archive: Segment[] = [];
  /** Milliseconds of audio fed to the transcriber in this run (audio timeline). */
  private audioMs = 0;
  private lastSegEndMs = 0;
  private interim = "";
  private nextSegId = 1;
  private startedAt: number | null = null;
  private reconnects = 0;
  /** Bumped on every start so late callbacks from a previous run are ignored. */
  private runId = 0;

  private source?: AudioSource;
  private stt?: SpeechProvider;
  /** Same audio, no context: the A/B baseline for the Technical Context Engine. */
  private baselineStt?: SpeechProvider;
  private baseline: { id: number; text: string }[] = [];
  private nextBaselineId = 1;
  private readonly termsWith: TermCounter;
  private readonly termsWithout: TermCounter;
  private readonly segmenter = new SentenceSegmenter();
  private readonly latency = new LatencyTracker();
  private readonly speechEnd = new SpeechEndDetector();
  readonly subscribers = new Set<WebSocket>();

  constructor(private readonly config: SessionConfig, private readonly translator: Translator) {
    this.id = config.id;
    this.termsWith = new TermCounter(config.glossary);
    this.termsWithout = new TermCounter(config.glossary);
  }

  /** Every segment of the current run, for caption export. */
  transcript(): readonly Segment[] {
    return this.archive;
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
      comparison: this.config.compareBaseline
        ? {
            withContext: this.termsWith.total(),
            withoutContext: this.termsWithout.total(),
            byTerm: this.config.glossary.map((t) => [t, this.termsWith.counts.get(t)!, this.termsWithout.counts.get(t)!]),
          }
        : null,
    };
  }

  snapshot(): ServerMsg {
    return { t: "snapshot", sessionId: this.id, summary: this.summary(), segments: this.segments, interim: this.interim, baseline: this.baseline };
  }

  async start() {
    this.stop();
    const run = ++this.runId;
    this.segments = [];
    this.archive = [];
    this.audioMs = 0;
    this.lastSegEndMs = 0;
    this.interim = "";
    this.nextSegId = 1;
    this.reconnects = 0;
    this.segmenter.reset();
    this.latency.reset();
    this.speechEnd.reset();
    this.baseline = [];
    this.nextBaselineId = 1;
    this.termsWith.reset();
    this.termsWithout.reset();
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
      if (run === this.runId) this.setHealth("error");
      return;
    }
    // Stopped or restarted while connecting: don't leave an orphan connection.
    if (run !== this.runId) return stt.close();

    if (this.config.compareBaseline) {
      const baseline = new GeminiTranscriber({ languageCodes: [this.config.language], vocabulary: [] });
      baseline.on("final", (text: string) => run === this.runId && this.onBaseline(text));
      baseline.on("error", (err: Error) => console.error(`[${this.id}] baseline stt error:`, err.message));
      try {
        await baseline.connect();
      } catch (err) {
        console.error(`[${this.id}] baseline disabled:`, (err as Error).message);
      }
      if (run !== this.runId) return baseline.close();
      this.baselineStt = baseline;
    }

    const source = new FileSource(this.config.source.path, this.config.source.startAtSec);
    this.source = source;
    source.on("chunk", (pcm: Buffer) => {
      this.speechEnd.push(pcm);
      this.audioMs += (pcm.length / 2 / 16000) * 1000;
      stt.send(pcm);
      this.baselineStt?.send(pcm);
    });
    source.on("error", (err: Error) => {
      if (run !== this.runId) return;
      console.error(`[${this.id}] audio error:`, err.message);
      // No audio → release the transcribers so they don't reconnect in a loop.
      this.stt?.close();
      this.baselineStt?.close();
      this.stt = undefined;
      this.baselineStt = undefined;
      this.setHealth("error");
    });
    source.on("end", () => this.onAudioEnd(run));
    source.start();
  }

  stop() {
    this.runId++;
    this.source?.stop();
    this.stt?.close();
    this.baselineStt?.close();
    this.source = undefined;
    this.stt = undefined;
    this.baselineStt = undefined;
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
      this.baselineStt?.send(silence);
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 5000));
    if (run !== this.runId) return;
    this.stt?.close();
    this.baselineStt?.close();
    this.stt = undefined;
    this.baselineStt = undefined;
    this.source = undefined;
    this.setHealth("ended");
  }

  private onInterim(text: string) {
    const { commits, pending } = this.segmenter.interim(text);
    this.commitBatch(commits, this.audioMs - INTERIM_LAG_MS, false);
    this.setInterim(pending);
  }

  private onFinal(text: string) {
    // A/B fairness: both sides count glossary terms on finals only.
    this.termsWith.add(text);
    const { commits } = this.segmenter.final(text);
    const speechEndAt = this.speechEnd.lastSpeechEndAt;
    const anchor = speechEndAt && Date.now() - speechEndAt < 10_000 ? this.audioMs - (Date.now() - speechEndAt) : this.audioMs;
    this.commitBatch(commits, anchor, true);
    this.setInterim("");
  }

  private onBaseline(text: string) {
    const line = { id: this.nextBaselineId++, text };
    this.baseline.push(line);
    if (this.baseline.length > MAX_BASELINE_LINES) this.baseline.shift();
    this.termsWithout.add(text);
    this.broadcast({ t: "baseline", sessionId: this.id, ...line });
  }

  private setInterim(text: string) {
    if (text === this.interim) return;
    this.interim = text;
    this.broadcast({ t: "interim", sessionId: this.id, text }, true);
  }

  /**
   * Lays a batch of sentences out on the audio timeline, walking backwards from
   * where the batch ends and giving each sentence a duration from its word count.
   * Only the last sentence of an utterance ends where speech actually ended.
   */
  private commitBatch(sentences: string[], anchorEndMs: number, utteranceEnd: boolean) {
    if (!sentences.length) return;
    const spans: [number, number][] = [];
    let cursor = Math.max(this.lastSegEndMs, anchorEndMs);
    for (let i = sentences.length - 1; i >= 0; i--) {
      const dur = (sentences[i].split(/\s+/).length / WORDS_PER_SEC) * 1000;
      const start = Math.max(this.lastSegEndMs, cursor - dur);
      spans[i] = [Math.round(start), Math.round(Math.max(cursor, start + 300))];
      cursor = start;
    }
    sentences.forEach((en, i) => this.commit(en, spans[i][0], spans[i][1], utteranceEnd && i === sentences.length - 1));
  }

  private commit(en: string, startMs: number, endMs: number, utteranceEnd: boolean) {
    const now = Date.now();
    const speechEndAt = this.speechEnd.lastSpeechEndAt;
    this.lastSegEndMs = Math.max(this.lastSegEndMs, endMs);
    const seg: Segment = {
      id: this.nextSegId++,
      startMs,
      endMs,
      en,
      lat: {
        transcriptReceivedAt: now,
        ...(utteranceEnd && speechEndAt && now - speechEndAt < 10_000 ? { speechEndAt } : {}),
      },
    };
    const context = this.segments.slice(-TRANSLATION_CONTEXT).map((s) => s.en);
    this.segments.push(seg);
    if (this.segments.length > MAX_SEGMENTS) this.segments.shift();
    this.archive.push(seg);
    if (this.archive.length > MAX_ARCHIVE) this.archive.shift();
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
