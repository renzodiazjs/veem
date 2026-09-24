"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef } from "react";
import { HEALTH_LABEL, useCaptions } from "@/lib/veem";

const LINES = 10;

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps glossary terms in a highlight so recognized terms pop out on screen. */
function Highlighted({ text, matcher }: { text: string; matcher: RegExp | null }) {
  if (!matcher) return <>{text}</>;
  const parts = text.split(matcher);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-emerald-400/20 px-1 text-emerald-300">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Column({
  title,
  subtitle,
  lines,
  count,
  matcher,
  accent,
}: {
  title: string;
  subtitle: string;
  lines: { id: number; text: string }[];
  count: number;
  matcher: RegExp | null;
  accent: boolean;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <section className={`flex min-h-0 flex-col rounded-2xl border ${accent ? "border-emerald-500/40" : "border-zinc-800"} bg-zinc-900`}>
      <header className="flex items-end justify-between gap-4 border-b border-zinc-800 p-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-zinc-400">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-4xl font-bold ${accent ? "text-emerald-400" : "text-zinc-300"}`}>{count}</p>
          <p className="text-xs uppercase tracking-wide text-zinc-500">términos reconocidos</p>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xl leading-snug">
        {lines.slice(-LINES).map((l) => (
          <p key={l.id}>
            <Highlighted text={l.text} matcher={matcher} />
          </p>
        ))}
        <div ref={bottom} />
      </div>
    </section>
  );
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const { summary, health, segments, baseline } = useCaptions(id);
  const cmp = summary?.comparison;
  const glossary = summary?.glossary;

  const matcher = useMemo(
    () =>
      glossary?.length
        ? new RegExp(`((?<![\\p{L}\\p{N}])(?:${[...glossary].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\p{L}\\p{N}]))`, "giu")
        : null,
    [glossary],
  );

  const h = HEALTH_LABEL[health];
  const contextLines = segments.map((s) => ({ id: s.id, text: s.en }));
  const diffTerms = cmp?.byTerm.filter(([, w, wo]) => w !== wo || w > 0) ?? [];

  return (
    <main className="flex h-dvh flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/control" className="text-sm font-semibold uppercase tracking-widest text-red-500">
            Technical Context Engine
          </Link>
          <h1 className="text-2xl font-bold">
            {summary?.title ?? id} <span className="font-normal text-zinc-400">· {summary?.speaker}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${h.dot}`} />
          {h.label} · mismo audio, dos transcripciones en paralelo
        </div>
      </header>

      {!cmp && <p className="text-zinc-400">Esta sala no tiene activada la comparación (compareBaseline en sessions.json).</p>}

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <Column
          title="Sin contexto"
          subtitle="Transcripción genérica"
          lines={baseline}
          count={cmp?.withoutContext ?? 0}
          matcher={matcher}
          accent={false}
        />
        <Column
          title="Con Context Engine"
          subtitle={`Glosario de la charla: ${glossary?.length ?? 0} términos`}
          lines={contextLines}
          count={cmp?.withContext ?? 0}
          matcher={matcher}
          accent
        />
      </div>

      {diffTerms.length > 0 && (
        <footer className="flex flex-wrap gap-2 text-sm">
          {diffTerms.map(([term, w, wo]) => (
            <span key={term} className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">
              {term} <span className="font-mono text-zinc-500">{wo}</span> → <span className="font-mono text-emerald-400">{w}</span>
            </span>
          ))}
        </footer>
      )}
    </main>
  );
}
