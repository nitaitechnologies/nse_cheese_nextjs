import { envOptional } from "../lib/env";
import type { SignalDoc } from "../lib/types";

const GAP_MS = 1200;
const MESSAGE_LIMIT = 1024;
const BATCH_QUIET_MS = 5000;
const BATCH_MAX_MS = 12000;
let chain: Promise<void> = Promise.resolve();
let lastAttemptAt = 0;
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let batchStartedAt = 0;
let pendingBreaks: Array<{ signal: SignalDoc; resolve: (sent: boolean) => void }> = [];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueue(work: () => Promise<void>): Promise<void> {
  const run = chain.then(work, work);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function postPushover(title: string, message: string): Promise<void> {
  const token = envOptional("PUSHOVER_APP_TOKEN");
  const user = envOptional("PUSHOVER_USER_KEY");
  if (!token || !user) {
    console.log(`[worker] pushover skipped (${title})`);
    return;
  }
  let lastError = "Pushover failed";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pause = Math.max(0, lastAttemptAt + GAP_MS - Date.now());
    if (pause > 0) await wait(pause);
    lastAttemptAt = Date.now();
    const response = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, user, title, message }),
    });
    if (response.ok) return;
    const body = await response.text();
    lastError = `Pushover failed (${response.status}) ${body.slice(0, 180)}`;
    if (response.status !== 429 || attempt === 2) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 15) : 2;
    await wait(backoff * 1000);
  }
  throw new Error(lastError);
}

export async function pushover(title: string, message: string): Promise<void> {
  await enqueue(() => postPushover(title, message));
}

function breakoutLine(signal: SignalDoc): string {
  const volume =
    signal.relativeVolume == null ? "" : ` · ${signal.relativeVolume.toFixed(1)}x`;
  return `${signal.tradingsymbol} ${signal.side} ${signal.strength} · ${signal.time}${volume}`;
}

function clubBreakouts(signals: SignalDoc[]): Array<{ title: string; message: string }> {
  const ordered = [...signals].sort(
    (a, b) => b.strength - a.strength || a.tradingsymbol.localeCompare(b.tradingsymbol),
  );
  const messages: string[] = [];
  let current = "";
  for (const signal of ordered) {
    const line = breakoutLine(signal);
    const next = current ? `${current}\n${line}` : line;
    if (current && next.length > MESSAGE_LIMIT) {
      messages.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) messages.push(current);
  const count = ordered.length;
  return messages.map((message, index) => ({
    title:
      messages.length > 1
        ? `${count} breaks · ${index + 1}/${messages.length}`
        : `${count} break${count === 1 ? "" : "s"}`,
    message,
  }));
}

function scheduleBreakouts(): void {
  if (!batchStartedAt) batchStartedAt = Date.now();
  const elapsed = Date.now() - batchStartedAt;
  const delay = Math.max(0, Math.min(BATCH_QUIET_MS, BATCH_MAX_MS - elapsed));
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    void flushBreakouts();
  }, delay);
}

async function flushBreakouts(): Promise<void> {
  batchTimer = null;
  batchStartedAt = 0;
  const waiting = pendingBreaks;
  pendingBreaks = [];
  if (waiting.length === 0) return;
  const sent = new Set<SignalDoc>();
  try {
    const parts = clubBreakouts(waiting.map((item) => item.signal));
    for (const part of parts) {
      await pushover(part.title, part.message);
    }
    for (const item of waiting) sent.add(item.signal);
  } catch (error) {
    console.error("[worker] pushover batch failed; not retrying these stocks today", error);
  }
  for (const item of waiting) item.resolve(sent.has(item.signal));
}

export function pushBreakout(signal: SignalDoc): Promise<boolean> {
  return new Promise((resolve) => {
    pendingBreaks.push({ signal, resolve });
    scheduleBreakouts();
  });
}

export async function pushAuthReminder(hasSession: boolean): Promise<void> {
  await pushover(
    "Kite is not connected",
    hasSession
      ? "A login is saved for today, but the live Kite connection is down. Reconnect in Setup before the open."
      : "Kite is not logged in for today. Connect it in Setup before the 9:15 IST open.",
  );
}

export async function pushStaleFeed(connected: boolean): Promise<void> {
  await pushover(
    "Live feed stalled",
    `No ticks for 30 seconds during market hours. Socket connected: ${connected ? "yes" : "no"}.`,
  );
}
