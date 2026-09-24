import type { LatencyStats, Segment } from "@veem/shared";

const WINDOW = 100;

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}

/** Rolling window of the last WINDOW measurements per stage. */
export class LatencyTracker {
  private en: number[] = [];
  private es: number[] = [];
  private mt: number[] = [];

  private push(arr: number[], v: number) {
    arr.push(v);
    if (arr.length > WINDOW) arr.shift();
  }

  recordTranscript(seg: Segment) {
    if (seg.lat.speechEndAt) this.push(this.en, seg.lat.transcriptReceivedAt - seg.lat.speechEndAt);
  }

  recordTranslation(seg: Segment) {
    const { speechEndAt, transcriptReceivedAt, translationReceivedAt } = seg.lat;
    if (!translationReceivedAt) return;
    this.push(this.mt, translationReceivedAt - transcriptReceivedAt);
    if (speechEndAt) this.push(this.es, translationReceivedAt - speechEndAt);
  }

  stats(): LatencyStats {
    return {
      enP50: percentile(this.en, 50),
      enP95: percentile(this.en, 95),
      esP50: percentile(this.es, 50),
      esP95: percentile(this.es, 95),
      mtP50: percentile(this.mt, 50),
      mtP95: percentile(this.mt, 95),
      samples: this.es.length,
    };
  }

  reset() {
    this.en = [];
    this.es = [];
    this.mt = [];
  }
}
