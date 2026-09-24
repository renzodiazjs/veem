// End-to-end smoke test against a running server: starts every session,
// prints captions + translations, then latency stats.
// Usage: pnpm --filter @veem/server e2e [seconds=30]
import WebSocket from "ws";
import type { ServerMsg, SessionSummary } from "@veem/shared";

const BASE = process.env.VEEM_URL ?? "http://localhost:8080";
const seconds = Number(process.argv[2] ?? 30);
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);

const { sessions } = (await (await fetch(`${BASE}/api/sessions`)).json()) as { sessions: SessionSummary[] };
const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws");

ws.on("open", async () => {
  for (const s of sessions) ws.send(JSON.stringify({ t: "subscribe", sessionId: s.id }));
  for (const s of sessions) await fetch(`${BASE}/api/sessions/${s.id}/start`, { method: "POST" });
});

ws.on("message", (raw) => {
  const m = JSON.parse(String(raw)) as ServerMsg;
  if (!("sessionId" in m)) return;
  const tag = `[${m.sessionId} ${ts()}s]`;
  if (m.t === "final") console.log(`${tag} EN #${m.seg.id}: ${m.seg.en}`);
  else if (m.t === "translation") console.log(`${tag} ES #${m.segId}: ${m.es}`);
  else if (m.t === "health") console.log(`${tag} health → ${m.health}`);
});

setTimeout(async () => {
  const { sessions: after } = (await (await fetch(`${BASE}/api/sessions`)).json()) as { sessions: SessionSummary[] };
  console.log("\n--- summary");
  for (const s of after) console.log(s.id, s.health, `segments=${s.segmentCount}`, JSON.stringify(s.latency));
  for (const s of after) await fetch(`${BASE}/api/sessions/${s.id}/stop`, { method: "POST" });
  process.exit(0);
}, seconds * 1000);
