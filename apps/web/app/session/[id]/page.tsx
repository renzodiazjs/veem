"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@veem/shared";
import { fmtMs, HEALTH_LABEL, useCaptions } from "@/lib/veem";

const SIZES = ["text-2xl", "text-3xl", "text-4xl", "text-5xl"] as const;
const VISIBLE_LINES = 12;

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
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLang(readPref<Lang>("veem.lang", "es", ["es", "en"]));
    setSize(Number(readPref("veem.size", "1", ["0", "1", "2", "3"])));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [segments, interim, lang]);

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

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 px-4 py-3 sm:px-8">
        <Link href="/" className="text-sm font-bold uppercase tracking-widest text-red-500">
          Nerdearla
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-zinc-400">{summary?.room}</p>
          <h1 className="truncate font-semibold">{summary?.title ?? id}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
          <span className={`h-2.5 w-2.5 rounded-full ${h.dot}`} />
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
              className={`rounded-md px-4 py-1.5 text-sm font-semibold ${lang === l ? "bg-zinc-50 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {l === "es" ? "Español" : "English"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" aria-label="Tamaño de texto">
          <button onClick={() => changeSize(-1)} className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900" aria-label="Achicar texto">
            A−
          </button>
          <button onClick={() => changeSize(1)} className="rounded-md px-3 py-1.5 text-lg text-zinc-400 hover:bg-zinc-900" aria-label="Agrandar texto">
            A+
          </button>
        </div>
        <p className="ml-auto font-mono text-xs text-zinc-500" title="Pipeline p50: audio enviado → traducción recibida">
          latencia p50 {fmtMs(summary?.latency.totalP50)}
        </p>
      </div>

      <section className={`flex-1 overflow-y-auto px-4 py-6 sm:px-8 ${SIZES[size]} leading-snug`} aria-live="polite" aria-atomic="false">
        <div className="mx-auto max-w-4xl space-y-4">
          {error && <p className="text-base text-red-400">{error}</p>}
          {!visible.length && !interim && (
            <p className="text-lg text-zinc-500">{health === "live" ? "Esperando al orador…" : "La sesión todavía no empezó."}</p>
          )}
          {visible.map((seg, i) => {
            const text = lang === "es" ? seg.es : seg.en;
            const latest = i === visible.length - 1;
            return (
              <p key={seg.id} className={`transition-colors duration-300 ${latest ? "text-zinc-50" : "text-zinc-400"}`}>
                {text ?? <span className="text-zinc-600">{seg.en}</span>}
              </p>
            );
          })}
          {interim && (
            <p className={lang === "en" ? "text-zinc-500" : "text-base text-zinc-600"} aria-hidden={lang === "es"}>
              {lang === "es" && <span className="mr-2 font-mono text-xs uppercase">en vivo · EN</span>}
              {interim}
            </p>
          )}
          <div ref={bottom} />
        </div>
      </section>
    </main>
  );
}
