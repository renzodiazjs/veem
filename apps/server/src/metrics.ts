import type { LatencyStats, Segment } from "@veem/shared";

const WINDOW = 100;

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}

/** Rolling window of the last WINDOW segments' latencies. */
export class LatencyTracker {
  private stt: number[] = [];
  private mt: number[] = [];
  private total: number[] = [];

  private push(arr: number[], v: number) {
    arr.push(v);
    if (arr.length > WINDOW) arr.shift();
  }

  recordTranscript(seg: Segment) {
    this.push(this.stt, seg.lat.transcriptReceivedAt - seg.lat.audioSentAt);
  }

  recordTranslation(seg: Segment) {
    const { audioSentAt, transcriptReceivedAt, translationReceivedAt } = seg.lat;
    if (!translationReceivedAt) return;
    this.push(this.mt, translationReceivedAt - transcriptReceivedAt);
    this.push(this.total, translationReceivedAt - audioSentAt);
  }

  stats(): LatencyStats {
    return {
      sttP50: percentile(this.stt, 50),
      mtP50: percentile(this.mt, 50),
      mtP95: percentile(this.mt, 95),
      totalP50: percentile(this.total, 50),
      totalP95: percentile(this.total, 95),
      last: this.total.at(-1) ?? null,
    };
  }

  reset() {
    this.stt = [];
    this.mt = [];
    this.total = [];
  }
}
