import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.SERVER_PORT ?? 8080);

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, path: "/ws" });
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ t: "sessions", list: [] }));
});

http.listen(port, () => console.log(`veem server listening on :${port}`));
