"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Lang } from "@veem/shared";
import { fmtMs, HEALTH_LABEL, useCaptions } from "@/lib/veem";

const SIZES = ["text-2xl", "text-3xl", "text-4xl", "text-5xl"] as const;
const VISIBLE_LINES = 12;
/** Only auto-scroll when the reader is already near the bottom. */
const STICK_PX = 120;

function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export default function CaptionsPage() {
  const { id } = useParams<{ id: string }>();
  const { summary, health, segments, interim, connected, error } = useCaptions(id);
  const [lang, setLang] = useState<Lang>("es");
  const [size, setSize] = useState(1);
  const scroller = useRef<HTMLElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    setLang(readPref<Lang>("veem.lang", "es", ["es", "en"]));
    setSize(Number(readPref("veem.size", "1", ["0", "1", "2", "3"])));
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [segments, interim, lang, size]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
  };

  const chooseLang = (l: Lang) => {
    setLang(l);
    writePref("veem.lang", l);
  };
  const changeSize = (d: number) => {
    const next = Math.max(0, Math.min(SIZES.length - 1, size + d));
    setSize(next);
    writePref("veem.size", String(next));
  };

  const h = HEALTH_LABEL[connected ? health : "reconnecting"];
  const visible = segments.slice(-VISIBLE_LINES);
  // Screen readers get one polite announcement per finished caption, never interim churn.
  const lastDone = [...segments].reverse().find((s) => (lang === "es" ? s.es : s.en));
  const announce = lastDone ? (lang === "es" ? lastDone.es : lastDone.en) : "";

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 px-4 py-2 sm:px-8 sm:py-3">
        <Link href="/" className="hidden text-sm font-bold uppercase tracking-widest text-red-500 sm:block">
          Nerdearla
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-zinc-400">{summary?.room}</p>
          <h1 className="truncate font-semibold">{summary?.title ?? id}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
          <span className={`h-2.5 w-2.5 rounded-full ${h.dot}`} aria-hidden />
          <span>{h.label}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2 sm:px-8">
        <div role="radiogroup" aria-label="Idioma" className="flex rounded-lg bg-zinc-900 p-1">
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={lang === l}
              onClick={() => chooseLang(l)}
              className={`min-h-11 rounded-md px-4 text-sm font-semibold ${lang === l ? "bg-zinc-50 text-zinc-950" : "text-zinc-300 hover:text-zinc-50"}`}
            >
              {l === "es" ? "Español" : "English"}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Tamaño de texto" className="flex items-center gap-1">
          <button
            onClick={() => changeSize(-1)}
            disabled={size === 0}
            className="min-h-11 min-w-11 rounded-md text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
            aria-label="Achicar texto"
          >
            A−
          </button>
          <button
            onClick={() => changeSize(1)}
            disabled={size === SIZES.length - 1}
            className="min-h-11 min-w-11 rounded-md text-lg text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
            aria-label="Agrandar texto"
          >
            A+
          </button>
        </div>
        <p
          className="ml-auto hidden font-mono text-xs text-zinc-400 sm:block"
          title="Mediana del retraso entre el fin de una frase hablada y su subtítulo"
        >
          retraso {lang === "es" ? fmtMs(summary?.latency.esP50) : fmtMs(summary?.latency.enP50)}
        </p>
      </div>

      <p className="sr-only" aria-live="polite" lang={lang}>
        {announce}
      </p>

      <section ref={scroller} onScroll={onScroll} className={`flex-1 overflow-y-auto px-4 py-6 sm:px-8 ${SIZES[size]} leading-snug`} lang={lang}>
        <div className="mx-auto max-w-4xl space-y-4">
          {error && <p className="text-base text-red-400">{error}</p>}
          {!visible.length && !interim && (
            <p className="text-lg text-zinc-400">{health === "live" ? "Esperando al orador…" : "La sesión todavía no empezó."}</p>
          )}
          {visible.map((seg, i) => {
            const latest = i === visible.length - 1;
            const pending = lang === "es" && !seg.es;
            return (
              <p
                key={seg.id}
                className={`transition-colors duration-300 motion-reduce:transition-none ${
                  pending ? "italic text-zinc-400" : latest ? "text-zinc-50" : "text-zinc-400"
                }`}
                aria-busy={pending || undefined}
                lang={pending ? "en" : lang}
              >
                {pending ? seg.en : lang === "es" ? seg.es : seg.en}
              </p>
            );
          })}
          {interim && (
            <p className="text-zinc-500" aria-hidden lang="en">
              {lang === "es" && <span className="block font-mono text-xs uppercase tracking-wide text-zinc-500">en vivo · inglés</span>}
              {interim}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
