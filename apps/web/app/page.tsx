"use client";

import Link from "next/link";
import { HEALTH_LABEL, useSessions } from "@/lib/veem";

export default function Lobby() {
  const { sessions, connected } = useSessions();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-red-500">Nerdearla 2026</p>
        <h1 className="mt-2 text-4xl font-bold sm:text-5xl">Subtítulos en vivo</h1>
        <p className="mt-3 text-lg text-zinc-400">Elegí tu sala. Subtítulos en español e inglés, sin app ni registro.</p>
      </header>

      {!connected && <p className="text-zinc-500">Conectando con el servidor…</p>}

      <ul className="grid gap-4">
        {sessions.map((s) => {
          const h = HEALTH_LABEL[s.health];
          return (
            <li key={s.id}>
              <Link
                href={`/session/${s.id}`}
                className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition hover:border-zinc-600 focus-visible:outline-2 focus-visible:outline-red-500"
              >
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <span className={`h-2.5 w-2.5 rounded-full ${h.dot}`} />
                  <span>{s.room}</span>
                  <span>·</span>
                  <span>{h.label}</span>
                </div>
                <h2 className="mt-2 text-2xl font-semibold">{s.title}</h2>
                {s.speaker && <p className="text-zinc-400">{s.speaker}</p>}
                <p className="mt-4 font-medium text-red-400">Ver subtítulos →</p>
              </Link>
            </li>
          );
        })}
      </ul>

      <footer className="mt-12 text-sm text-zinc-500">
        <Link href="/control" className="underline hover:text-zinc-300">
          Control Center
        </Link>
      </footer>
    </main>
  );
}
