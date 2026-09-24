/** RMS of a PCM16 little-endian mono chunk. */
export function rms(pcm: Buffer): number {
  const samples = pcm.length >> 1;
  if (!samples) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const v = pcm.readInt16LE(i * 2);
    sum += v * v;
  }
  return Math.sqrt(sum / samples);
}

/** Chunks above this RMS count as speech. Tunable via env for noisy rooms. */
export const SPEECH_RMS = Number(process.env.SPEECH_RMS_THRESHOLD ?? 500);
/** Consecutive silent 100ms chunks that mark the end of a phrase. */
const SILENT_CHUNKS = 3;

/**
 * Tracks when the speaker last stopped talking (start of a ≥300ms pause),
 * which is the reference point for measuring speech → caption latency.
 * The pause start stays valid even after the speaker resumes, so a late
 * transcript is still measured against the right moment.
 */
export class SpeechEndDetector {
  private lastVoicedAt = 0;
  private silent = 0;
  lastSpeechEndAt = 0;

  push(pcm: Buffer, at = Date.now()) {
    if (rms(pcm) > SPEECH_RMS) {
      this.lastVoicedAt = at;
      this.silent = 0;
      return;
    }
    if (++this.silent === SILENT_CHUNKS && this.lastVoicedAt) this.lastSpeechEndAt = this.lastVoicedAt;
  }

  reset() {
    this.lastVoicedAt = 0;
    this.silent = 0;
    this.lastSpeechEndAt = 0;
  }
}
