import { envOptional } from "@/lib/env";
import { unauthorized } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const base = envOptional("WORKER_INTERNAL_URL") ?? "http://127.0.0.1:4001";
  try {
    const upstream = await fetch(`${base}/stream`, {
      cache: "no-store",
      signal: request.signal,
      headers: { Accept: "text/event-stream" },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("Worker stream is unavailable", { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return new Response("Worker stream is unavailable", { status: 502 });
  }
}
