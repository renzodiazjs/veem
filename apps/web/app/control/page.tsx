"use client";

import Link from "next/link";
import { audienceUrl, controlSession, exportUrl, fmtMs, HEALTH_LABEL, useSessions } from "@/lib/veem";
import { RoomQr } from "@/components/RoomQr";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className="font-mono text-lg">{value}</dd>
    </div>
  );
}

export default function ControlCenter() {
  const { sessions, lanHosts, connected } = useSessions();
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

      <div className="grid gap-4 lg:grid-cols-2">
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

              {s.lastError && (
                <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {s.lastError}
                </p>
              )}

              <div className="mt-5 flex items-baseline gap-3">
                <p className="font-mono text-5xl font-bold text-emerald-400">{fmtMs(s.latency.esP50)}</p>
                <p className="text-sm text-zinc-400">
                  del fin de la frase
                  <br />
                  al subtítulo en español (p50)
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Habla → EN p50" value={fmtMs(s.latency.enP50)} />
                <Stat label="Habla → ES p95" value={fmtMs(s.latency.esP95)} />
                <Stat label="Traducción p50" value={fmtMs(s.latency.mtP50)} />
                <Stat label="Segmentos" value={s.segmentCount} />
                <Stat label="Reconexiones" value={s.reconnects} />
                <Stat label="Glosario" value={`${s.glossary.length} términos`} />
                {s.comparison && (
                  <Stat label="Términos: con / sin contexto" value={`${s.comparison.withContext} / ${s.comparison.withoutContext}`} />
                )}
              </dl>

              <div className="mt-5 flex items-center gap-4 border-t border-zinc-800 pt-4">
                <RoomQr url={audienceUrl(s.id, lanHosts)} size={96} />
                <div className="min-w-0 text-sm">
                  <p className="text-zinc-400">Escaneá para ver los subtítulos</p>
                  <p className="truncate font-mono text-xs text-zinc-500">{audienceUrl(s.id, lanHosts)}</p>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-zinc-300">
                    {(["vtt", "srt", "txt"] as const).flatMap((fmt) =>
                      (["en", "es"] as const).map((lang) => (
                        <a key={fmt + lang} href={exportUrl(s.id, fmt, lang)} className="underline decoration-zinc-600 hover:text-white">
                          .{lang}.{fmt}
                        </a>
                      )),
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => controlSession(s.id, running ? "stop" : "start")}
                  className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${running ? "bg-zinc-800 hover:bg-zinc-700" : "bg-red-600 hover:bg-red-500"}`}
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
