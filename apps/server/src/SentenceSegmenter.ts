/**
 * Turns Gemini's cumulative interim transcripts into stable sentences as early
 * as possible, so translation does not have to wait for a speech pause.
 *
 * A sentence is "stable" once more text follows its closing punctuation.
 * The final transcript of an utterance flushes everything not yet committed.
 * Commits are tracked by sentence count, so small wording revisions between
 * interim and final never duplicate text.
 */
export interface SegmenterResult {
  commits: string[];
  pending: string;
}

const SENTENCE = /[^.?!]*[.?!]+(?=\s|$)/g;

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

export class SentenceSegmenter {
  private committed = 0;

  interim(text: string): SegmenterResult {
    const { sentences, rest } = splitSentences(text);
    // Last sentence is only stable if something already follows it.
    const stable = rest ? sentences.length : Math.max(0, sentences.length - 1);
    const commits = sentences.slice(this.committed, stable);
    this.committed = Math.max(this.committed, stable);
    const pending = [...sentences.slice(this.committed), rest].filter(Boolean).join(" ");
    return { commits, pending };
  }

  final(text: string): SegmenterResult {
    const { sentences, rest } = splitSentences(text);
    const commits = [...sentences, rest].filter(Boolean).slice(this.committed);
    this.committed = 0;
    return { commits, pending: "" };
  }

  reset() {
    this.committed = 0;
  }
}
