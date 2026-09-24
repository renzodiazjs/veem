"use client";

import Link from "next/link";
import { controlSession, fmtMs, HEALTH_LABEL, useSessions } from "@/lib/veem";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="font-mono text-lg">{value}</dd>
    </div>
  );
}

export default function ControlCenter() {
  const { sessions, connected } = useSessions();
  const live = sessions.filter((s) => s.health === "live").length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm font-semibold uppercase tracking-widest text-red-500">
            Nerdearla 2026
          </Link>
          <h1 className="mt-1 text-3xl font-bold">Control Center</h1>
        </div>
        <p className="font-mono text-2xl">
          <span className="text-red-400">{live}</span> / {sessions.length} sesiones en vivo
          {!connected && <span className="ml-3 text-sm text-amber-400">servidor desconectado</span>}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {sessions.map((s) => {
          const h = HEALTH_LABEL[s.health];
          const running = s.health === "live" || s.health === "connecting" || s.health === "reconnecting";
          return (
            <article key={s.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-400">{s.room}</p>
                  <h2 className="truncate text-xl font-semibold">{s.title}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${h.dot}`} />
                  {h.label}
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Habla → EN p50" value={fmtMs(s.latency.enP50)} />
                <Stat label="Habla → ES p50" value={fmtMs(s.latency.esP50)} />
                <Stat label="Habla → ES p95" value={fmtMs(s.latency.esP95)} />
                <Stat label="Traducción p50" value={fmtMs(s.latency.mtP50)} />
                <Stat label="Segmentos" value={s.segmentCount} />
                <Stat label="Muestras" value={s.latency.samples} />
                <Stat label="Reconexiones" value={s.reconnects} />
                <Stat label="Glosario" value={`${s.glossary.length} términos`} />
                {s.comparison && (
                  <Stat label="Términos: con / sin contexto" value={`${s.comparison.withContext} / ${s.comparison.withoutContext}`} />
                )}
              </dl>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => controlSession(s.id, running ? "stop" : "start")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${running ? "bg-zinc-800 hover:bg-zinc-700" : "bg-red-600 hover:bg-red-500"}`}
                >
                  {running ? "Detener" : "Iniciar"}
                </button>
                <Link href={`/session/${s.id}`} className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                  Ver subtítulos →
                </Link>
                {s.comparison && (
                  <Link href={`/session/${s.id}/compare`} className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
                    Context Engine A/B →
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
