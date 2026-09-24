function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Counts exact mentions of glossary terms (case-insensitive, whole words).
 * Used to compare context-aware vs baseline transcripts of the same audio.
 */
export class TermCounter {
  private readonly patterns: [string, RegExp][];
  readonly counts = new Map<string, number>();

  constructor(terms: string[]) {
    this.patterns = terms.map((t) => [t, new RegExp(`(?<![\\p{L}\\p{N}])${escape(t)}(?![\\p{L}\\p{N}])`, "giu")]);
    for (const t of terms) this.counts.set(t, 0);
  }

  add(text: string) {
    for (const [term, re] of this.patterns) {
      const n = text.match(re)?.length ?? 0;
      if (n) this.counts.set(term, this.counts.get(term)! + n);
    }
  }

  total() {
    let sum = 0;
    for (const n of this.counts.values()) sum += n;
    return sum;
  }

  reset() {
    for (const t of this.counts.keys()) this.counts.set(t, 0);
  }
}
