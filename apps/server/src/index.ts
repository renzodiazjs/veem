import { createServer, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMsg, ServerMsg } from "@veem/shared";
import { loadConfig } from "./config";
import { SessionManager } from "./SessionManager";
import { createTranslator } from "./providers/Translator";
import { toSrt, toTxt, toVtt } from "./export/captions";
import type { Lang } from "@veem/shared";

/** LAN IPv4 addresses, so QR codes point somewhere a phone in the room can reach. */
function lanHosts() {
  if (process.env.PUBLIC_HOST) return [process.env.PUBLIC_HOST];
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n!.address);
}

const port = Number(process.env.SERVER_PORT ?? 8080);
const conference = loadConfig();
const translator = createTranslator();
const manager = new SessionManager(conference, translator);

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

const http = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") return json(res, 204, null);
  if (url.pathname === "/health") return json(res, 200, { ok: true, sessions: manager.list().length });
  if (url.pathname === "/api/sessions" && req.method === "GET")
    return json(res, 200, { conference: conference.name, sessions: manager.list() });

  const action = url.pathname.match(/^\/api\/sessions\/([\w-]+)\/(start|stop)$/);
  if (action && req.method === "POST") {
    const session = manager.get(action[1]);
    if (!session) return json(res, 404, { error: "unknown session" });
    if (action[2] === "start") session.start();
    else session.stop();
    return json(res, 200, session.summary());
  }
  const exp = url.pathname.match(/^\/api\/sessions\/([\w-]+)\/captions\.(vtt|srt|txt)$/);
  if (exp && req.method === "GET") {
    const session = manager.get(exp[1]);
    if (!session) return json(res, 404, { error: "unknown session" });
    const lang: Lang = url.searchParams.get("lang") === "es" ? "es" : "en";
    const format = exp[2] as "vtt" | "srt" | "txt";
    const body = { vtt: toVtt, srt: toSrt, txt: toTxt }[format](session.transcript(), lang);
    res.writeHead(200, {
      "content-type": format === "vtt" ? "text/vtt; charset=utf-8" : "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${session.id}.${lang}.${format}"`,
      "access-control-allow-origin": "*",
    });
    return res.end(body);
  }
  json(res, 404, { error: "not found" });
});

const wss = new WebSocketServer({ server: http, path: "/ws" });
const watchers = new Set<WebSocket>();

const send = (ws: WebSocket, msg: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send(ws, { t: "error", message: "invalid json" });
    }
    if (!msg || typeof msg !== "object") return send(ws, { t: "error", message: "invalid message" });
    if (msg.t === "watchSessions") {
      watchers.add(ws);
      send(ws, { t: "sessions", list: manager.list(), serverTime: Date.now(), lanHosts: lanHosts() });
    } else if (msg.t === "subscribe") {
      const session = manager.get(msg.sessionId);
      if (!session) return send(ws, { t: "error", message: `unknown session ${msg.sessionId}` });
      session.subscribers.add(ws);
      send(ws, session.snapshot());
    } else if (msg.t === "unsubscribe") {
      manager.get(msg.sessionId)?.subscribers.delete(ws);
    }
  });
  ws.on("close", () => {
    watchers.delete(ws);
    for (const s of manager.list()) manager.get(s.id)!.subscribers.delete(ws);
  });
});

// Lobby + Control Center refresh: health, segment counts and latency once per second.
setInterval(() => {
  if (!watchers.size) return;
  const data = JSON.stringify({ t: "sessions", list: manager.list(), serverTime: Date.now(), lanHosts: lanHosts() } satisfies ServerMsg);
  for (const ws of watchers) if (ws.readyState === ws.OPEN) ws.send(data);
}, 1000);

http.listen(port, () => {
  console.log(`veem: "${conference.name}" — ${conference.sessions.length} sessions — translator: ${translator.name}`);
  console.log(`listening on http://localhost:${port} (ws: /ws)`);
  // Masked, so a stale key inherited from the environment is easy to spot.
  const key = process.env.GEMINI_API_KEY;
  console.log(`gemini key: ${key ? "…" + key.slice(-4) : "MISSING"}`);
  manager.startAutostart();
});

const shutdown = () => {
  manager.stopAll();
  process.exit(0);
};
// One bad message or provider callback must never take every room down.
process.on("uncaughtException", (err) => console.error("[uncaught]", err));
process.on("unhandledRejection", (err) => console.error("[unhandled]", err));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
