import type { Lang, Segment } from "@veem/shared";

function ts(ms: number, sep: "." | ",") {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = Math.floor(ms % 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

const text = (s: Segment, lang: Lang) => (lang === "es" ? (s.es ?? s.en) : s.en);

export function toVtt(segments: readonly Segment[], lang: Lang) {
  const cues = segments.map((s) => `${s.id}\n${ts(s.startMs, ".")} --> ${ts(s.endMs, ".")}\n${text(s, lang)}`);
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

export function toSrt(segments: readonly Segment[], lang: Lang) {
  return segments.map((s, i) => `${i + 1}\n${ts(s.startMs, ",")} --> ${ts(s.endMs, ",")}\n${text(s, lang)}`).join("\n\n") + "\n";
}

export function toTxt(segments: readonly Segment[], lang: Lang) {
  return segments.map((s) => `[${ts(s.startMs, ".").slice(0, 8)}] ${text(s, lang)}`).join("\n") + "\n";
}
