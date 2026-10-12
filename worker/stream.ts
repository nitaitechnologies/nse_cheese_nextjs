import http from "node:http";
import { envOptional } from "../lib/env";

type Client = http.ServerResponse;

const clients = new Set<Client>();

let status: Record<string, unknown> = {
  connected: false,
  lastTickAt: null,
  watchCount: 0,
  message: "Starting",
};

export function broadcast(event: string, data: unknown): void {
  if (event === "status") status = data as Record<string, unknown>;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

export function startStream(): void {
  const port = Number(envOptional("WORKER_PORT") ?? 4001);
  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.url === "/stream") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      clients.add(response);
      response.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
      request.on("close", () => clients.delete(response));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(port, "0.0.0.0");
  setInterval(() => {
    for (const client of clients) client.write(": ping\n\n");
  }, 15000).unref();
}
