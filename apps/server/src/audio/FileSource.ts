import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export const SAMPLE_RATE = 16000;
export const CHUNK_BYTES = 3200; // 100ms of PCM16 mono @ 16kHz

export interface AudioSource extends EventEmitter {
  /** Emits "chunk" (Buffer), "end", "error" (Error) */
  start(): void;
  stop(): void;
}

/**
 * Decodes any audio/video file with ffmpeg and emits PCM16 16kHz mono chunks
 * paced at real time (-re), simulating a live stage feed.
 */
export class FileSource extends EventEmitter implements AudioSource {
  private proc?: ChildProcess;
  private buf = Buffer.alloc(0);
  private stopped = false;

  constructor(private readonly path: string, private readonly startAtSec = 0) {
    super();
  }

  start() {
    this.stopped = false;
    const args = ["-loglevel", "error", "-re"];
    if (this.startAtSec > 0) args.push("-ss", String(this.startAtSec));
    args.push("-i", this.path, "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "pipe:1");
    const proc = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    this.proc = proc;

    proc.stdout!.on("data", (data: Buffer) => {
      this.buf = Buffer.concat([this.buf, data]);
      while (this.buf.length >= CHUNK_BYTES) {
        this.emit("chunk", this.buf.subarray(0, CHUNK_BYTES));
        this.buf = this.buf.subarray(CHUNK_BYTES);
      }
    });
    let stderr = "";
    proc.stderr!.on("data", (d) => (stderr += d));
    proc.on("error", (err) => this.emit("error", err));
    proc.on("close", (code) => {
      if (this.proc !== proc || this.stopped) return;
      if (code !== 0) this.emit("error", new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
      else this.emit("end");
    });
  }

  stop() {
    this.stopped = true;
    this.proc?.kill();
    this.proc = undefined;
    this.buf = Buffer.alloc(0);
  }
}
