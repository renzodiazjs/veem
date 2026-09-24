import { EventEmitter } from "node:events";
import { GoogleGenAI, Modality, type Session } from "@google/genai";

const MODEL = process.env.GEMINI_STT_MODEL ?? "gemini-3.5-transcribe-live";
/** Transcription sessions are capped at ~10 min; rotate before that. */
const ROTATE_AFTER_MS = 9 * 60 * 1000;
const MAX_BACKOFF_MS = 8000;
const CONNECT_TIMEOUT_MS = 10_000;

export interface SpeechProvider extends EventEmitter {
  /** Emits "interim" (text), "final" (text), "open", "reconnecting", "error" (Error) */
  connect(): Promise<void>;
  send(pcm: Buffer): void;
  close(): void;
  /** Last provider error, if the connection is currently failing */
  readonly lastError?: string;
}

export interface TranscriberOptions {
  languageCodes: string[];
  vocabulary: string[];
}

export class GeminiTranscriber extends EventEmitter implements SpeechProvider {
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  private live?: Session;
  private closed = false;
  private attempt = 0;
  private rotateTimer?: NodeJS.Timeout;

  constructor(private readonly opts: TranscriberOptions) {
    super();
  }

  async connect() {
    this.closed = false;
    await this.open();
  }

  /** Last provider error, surfaced in the Control Center (e.g. "credits depleted"). */
  lastError?: string;
  private connSeq = 0;
  private currentConn = 0;
  private retiring = new Set<number>();

  private async open() {
    const conn = ++this.connSeq;
    // The SDK never settles connect() if the server closes during setup (e.g. billing
    // or quota errors), so race it against an early close and a timeout.
    let failSetup!: (err: Error) => void;
    const setupFailed = new Promise<never>((_, reject) => (failSetup = reject));
    const timeout = setTimeout(() => failSetup(new Error(`connect timeout after ${CONNECT_TIMEOUT_MS} ms`)), CONNECT_TIMEOUT_MS);
    const connecting = this.ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: {
          languageCodes: this.opts.languageCodes,
          ...(this.opts.vocabulary.length ? { customVocabulary: this.opts.vocabulary } : {}),
        },
      },
      callbacks: {
        onmessage: (m) => {
          const current = conn === this.currentConn;
          if (!current && !this.retiring.has(conn)) return;
          const sc = m.serverContent;
          if (sc?.interimInputTranscription?.text && current) this.emit("interim", sc.interimInputTranscription.text);
          if (sc?.inputTranscription?.text) this.emit("final", sc.inputTranscription.text);
        },
        onerror: (e) => this.emit("error", new Error(e.message ?? "gemini live error")),
        onclose: (e) => {
          failSetup(new Error(`${e.code} ${e.reason || "closed during setup"}`));
          if (!this.closed && conn === this.currentConn) {
            console.warn(`[stt] connection closed: ${e.code} ${e.reason}`);
            this.lastError = e.reason || `closed (${e.code})`;
          }
          this.retiring.delete(conn);
          if (conn === this.currentConn && !this.closed) this.reconnect();
        },
      },
    });
    let session: Session;
    try {
      session = await Promise.race([connecting, setupFailed]);
    } catch (err) {
      this.lastError = (err as Error).message;
      connecting.then((s) => s.close()).catch(() => {});
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    this.lastError = undefined;
    // close() may have been called while the connection was being established.
    if (this.closed) {
      session.close();
      return;
    }
    this.live = session;
    this.currentConn = conn;
    this.attempt = 0;
    this.emit("open");
    clearTimeout(this.rotateTimer);
    this.rotateTimer = setTimeout(() => this.rotate(), ROTATE_AFTER_MS);
  }

  /** Open a fresh connection, then let the old one flush its last final. */
  private async rotate() {
    const old = this.live;
    const oldConn = this.currentConn;
    try {
      await this.open();
      if (old) {
        this.retiring.add(oldConn);
        setTimeout(() => old.close(), 3000);
      }
    } catch (err) {
      this.emit("error", err as Error);
      if (!this.closed) this.rotateTimer = setTimeout(() => this.rotate(), 30_000);
    }
  }

  private reconnect() {
    if (this.closed) return;
    this.live = undefined;
    this.currentConn = 0;
    this.emit("reconnecting");
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt++) * (0.75 + Math.random() * 0.5);
    setTimeout(() => {
      if (this.closed) return;
      this.open().catch((err) => {
        this.emit("error", err);
        this.reconnect();
      });
    }, delay);
  }

  send(pcm: Buffer) {
    this.live?.sendRealtimeInput({ audio: { data: pcm.toString("base64"), mimeType: "audio/pcm;rate=16000" } });
  }

  close() {
    this.closed = true;
    clearTimeout(this.rotateTimer);
    this.live?.close();
    this.live = undefined;
  }
}
