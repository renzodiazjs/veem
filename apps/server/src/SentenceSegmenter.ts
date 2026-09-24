/**
 * Turns Gemini's interim transcripts into stable sentences as early as
 * possible, so translation does not have to wait for a speech pause.
 *
 * Gemini's interim text is a sliding window: it grows at the end and gets
 * trimmed at the start, and the final transcript may reword the interim.
 * So sentences are deduplicated by content, never by position:
 *  - a sentence is "stable" once more text follows its closing punctuation;
 *  - it is committed unless its word bigrams are mostly already present in
 *    the recent commits taken together (catches trimmed prefixes like
 *    "to Nerdearla.", rewordings, and finals that merge several committed
 *    sentences into one).
 */
export interface SegmenterResult {
  commits: string[];
  pending: string;
}

const SENTENCE = /[^.?!]*[.?!]+(?=\s|$)/g;
const RECENT = 12;
const OVERLAP = 0.6;
/** Shorter leftovers after removing known text are treated as noise. */
const MIN_NOVEL_WORDS = 3;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function splitSentences(text: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let end = 0;
  for (const m of text.matchAll(SENTENCE)) {
    const s = m[0].trim();
    if (s) sentences.push(s);
    end = m.index! + m[0].length;
  }
  return { sentences, rest: text.slice(end).trim() };
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word bigrams (unigram for one-word text), so short sentences sharing common words don't collide. */
function grams(s: string): string[] {
  const w = words(s);
  if (w.length < 2) return w;
  return w.slice(1).map((x, i) => `${w[i]} ${x}`);
}

/** Share of `candidate`'s word bigrams already present in `committed`. */
export function overlap(candidate: string, committed: string): number {
  const c = grams(candidate);
  if (!c.length) return 1;
  const pool = new Set([...grams(committed), ...words(committed)]);
  return c.filter((g) => pool.has(g)).length / c.length;
}

export class SentenceSegmenter {
  private recent: string[] = [];

  /**
   * Returns the part of `sentence` not already shown, or null if nothing new:
   *  - a known prefix (≥4 words) is cut off, so extensions of a committed
   *    sentence only add their new words;
   *  - a mostly-known sentence keeps only the tail after its last known bigram.
   */
  private novel(sentence: string): string | null {
    const pool = new Set(grams(this.recent.join(" ")));
    const tokens = sentence.split(/\s+/).filter(Boolean);
    const norm = tokens.map((t) => words(t).join(" "));
    const known = (i: number) => i > 0 && pool.has(`${norm[i - 1]} ${norm[i]}`);

    let start = 0;
    while (known(start + 1)) start++;
    if (start >= 3) tokens.splice(0, start + 1), norm.splice(0, start + 1);
    else start = -1;

    const rest = tokens.join(" ");
    if (start >= 0 && tokens.length < MIN_NOVEL_WORDS) return null;
    if (overlap(rest, this.recent.join(" ")) < OVERLAP) return capitalize(rest.replace(/^[,;:\s]+/, ""));

    let last = 0;
    for (let i = 1; i < norm.length; i++) if (known(i)) last = i;
    const tail = tokens.slice(last + 1);
    return tail.length >= MIN_NOVEL_WORDS ? capitalize(tail.join(" ").replace(/^[,;:\s]+/, "")) : null;
  }

  private take(sentences: string[]): string[] {
    const out: string[] = [];
    for (const sentence of sentences) {
      const s = this.novel(sentence);
      if (!s) continue;
      out.push(s);
      this.recent.push(s);
      if (this.recent.length > RECENT) this.recent.shift();
    }
    return out;
  }

  interim(text: string): SegmenterResult {
    const { sentences, rest } = splitSentences(text);
    // The last sentence is only stable if something already follows it.
    const stableCount = rest ? sentences.length : Math.max(0, sentences.length - 1);
    const commits = this.take(sentences.slice(0, stableCount));
    const tail = [...sentences.slice(stableCount), rest].filter(Boolean).join(" ");
    return { commits, pending: tail };
  }

  final(text: string): SegmenterResult {
    const { sentences, rest } = splitSentences(text);
    return { commits: this.take([...sentences, rest].filter(Boolean)), pending: "" };
  }

  reset() {
    this.recent = [];
  }
}
