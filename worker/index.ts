import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import cron from "node-cron";
import { envOptional } from "../lib/env";
import { readyDb } from "../lib/sqlite";
import {
  claimJob,
  claimNotice,
  clearNotice,
  enqueueJob,
  getKiteSession,
  getSettings,
  listFeedTargets,
  pruneExpiredData,
  requeueInterruptedJobs,
  updateJob,
  writeRuntime,
} from "../lib/store";
import { RETENTION_DAYS } from "../lib/retention";
import { istDateString, istTimeHM, isMarketOpen, isWeekdayIst } from "../lib/time";
import {
  connectedSince,
  feedConnected,
  feedSize,
  flushQuotes,
  lastTick,
  publishForming,
  stopFeed,
  syncFeed,
} from "./feed";
import { syncConstituents } from "./constituents";
import { backfillStocks, reconcileStocks } from "./history";
import { setAccessToken } from "./kite";
import { pushAuthReminder, pushStaleFeed } from "./notify";
import { broadcast, startStream } from "./stream";

if (existsSync(".env")) loadEnvFile(".env");

const STALE_NOTICE = "stale-feed";
const startedAt = Date.now();
let staleAlerted = false;
let reconciling = false;
let bootstrapping = false;
let syncDone = false;
let catchUpQueued = false;
let bootstrapNotBefore = 0;
let loggedFeed = -1;

function statusMessage(hasToken: boolean): string {
  if (!hasToken) return "Kite login required";
  if (feedConnected()) return "Live";
  return "Connecting to Kite";
}

async function publishStatus(hasToken: boolean): Promise<void> {
  const status = {
    connected: feedConnected(),
    lastTickAt: lastTick(),
    watchCount: feedSize(),
    message: statusMessage(hasToken),
  };
  broadcast("status", status);
  await writeRuntime(status);
}

function istMinutes(date = new Date()): number {
  const [hour, minute] = istTimeHM(date).split(":").map(Number);
  return hour * 60 + minute;
}

async function remind(slot: string): Promise<void> {
  if (!isWeekdayIst()) return;
  const today = istDateString(new Date());
  const session = await getKiteSession(today);
  const warming = Date.now() - startedAt < 30_000;
  const connected = Boolean(session?.access_token) && (warming || feedConnected());
  if (connected) return;
  const claimed = await claimNotice(`kite-auth-${today}-${slot}`);
  if (!claimed) return;
  try {
    await pushAuthReminder(Boolean(session?.access_token));
  } catch (error) {
    console.error("[worker] auth reminder failed", error);
    await clearNotice(`kite-auth-${today}-${slot}`);
  }
}

async function remindIfMorning(): Promise<void> {
  if (!isWeekdayIst()) return;
  const mins = istMinutes();
  if (mins < 8 * 60 + 45 || mins >= 9 * 60 + 15) return;
  await remind(mins < 9 * 60 + 5 ? "0845" : "0905");
}

async function reconcile(): Promise<void> {
  if (reconciling) return;
  const session = await getKiteSession();
  if (!session) return;
  reconciling = true;
  try {
    setAccessToken(session.access_token);
    await reconcileStocks(async () => undefined);
    console.log("[worker] end of day reconcile complete");
  } catch (error) {
    console.error("[worker] reconcile failed", error);
  } finally {
    reconciling = false;
  }
}

async function runJobs(): Promise<void> {
  const job = await claimJob();
  if (!job) return;
  try {
    if (job.type === "instruments") {
      const book = await syncConstituents();
      const message = `${book.stocks} index stocks across ${book.indices} indices`;
      await updateJob(job._id, {
        status: "done",
        progress: { done: book.stocks, total: book.stocks, message },
      });
      return;
    }
    await backfillStocks(job.days ?? RETENTION_DAYS, async (done, total, message) => {
      await updateJob(job._id, {
        status: "running",
        progress: { done, total, message },
      });
    });
    await updateJob(job._id, {
      status: "done",
      progress: { done: 1, total: 1, message: "Backfill complete" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    console.error("[worker] job failed", error);
    await updateJob(job._id, {
      status: "error",
      error: message,
      progress: { done: 0, total: 0, message },
    });
  }
}

function kickBootstrap(): void {
  if (bootstrapping || (syncDone && catchUpQueued)) return;
  if (Date.now() < bootstrapNotBefore) return;
  bootstrapping = true;
  void (async () => {
    try {
      if (!syncDone) {
        await syncConstituents();
        syncDone = true;
        console.log("[worker] index stocks synced");
      }
      if (!catchUpQueued) {
        await requeueInterruptedJobs();
        const settings = await getSettings();
        await enqueueJob("backfill", settings.backfillDays);
        catchUpQueued = true;
        console.log("[worker] catch-up queued from the last stored bar");
      }
    } catch (error) {
      bootstrapNotBefore = Date.now() + 60_000;
      console.error("[worker] startup catch-up failed", error);
    } finally {
      bootstrapping = false;
    }
  })();
}

async function checkStale(): Promise<void> {
  if (!isMarketOpen() || feedSize() === 0) {
    staleAlerted = false;
    await clearNotice(STALE_NOTICE);
    return;
  }
  const tick = lastTick();
  const quiet = tick == null || Date.now() - tick > 30_000;
  const since = connectedSince();
  const warming =
    since === 0 ? Date.now() - startedAt < 45_000 : Date.now() - since < 45_000;
  if (!quiet || warming || !feedConnected()) {
    if (!quiet) {
      staleAlerted = false;
      await clearNotice(STALE_NOTICE);
    }
    if (!feedConnected() && !warming) {
      const claimed = await claimNotice(STALE_NOTICE);
      if (claimed) {
        staleAlerted = true;
        try {
          await pushStaleFeed(false);
        } catch (error) {
          console.error("[worker] stale alert failed", error);
          await clearNotice(STALE_NOTICE);
        }
      }
    }
    return;
  }
  if (staleAlerted) return;
  const claimed = await claimNotice(STALE_NOTICE);
  if (!claimed) {
    staleAlerted = true;
    return;
  }
  staleAlerted = true;
  try {
    await pushStaleFeed(true);
  } catch (error) {
    console.error("[worker] stale alert failed", error);
    staleAlerted = false;
    await clearNotice(STALE_NOTICE);
  }
}

async function controlLoop(): Promise<void> {
  const session = await getKiteSession();
  setAccessToken(session?.access_token ?? null);
  if (session) kickBootstrap();
  const targets = await listFeedTargets();
  if (targets.length !== loggedFeed) {
    loggedFeed = targets.length;
    console.log(`[worker] live feed ${targets.length} symbols`);
  }
  await syncFeed(session?.access_token ?? null, targets);
  await publishStatus(Boolean(session));
}

async function pruneOldData(): Promise<void> {
  try {
    const { removed } = await pruneExpiredData();
    if (removed > 0) console.log(`[worker] removed ${removed} rows older than ${RETENTION_DAYS} days`);
  } catch (error) {
    console.error("[worker] retention prune failed", error);
  }
}

async function main(): Promise<void> {
  await readyDb();
  await pruneOldData();
  startStream();
  const zone = { timezone: envOptional("TZ") ?? "Asia/Kolkata" };
  cron.schedule("45 8 * * 1-5", () => void remind("0845"), { timezone: "Asia/Kolkata" });
  cron.schedule("5 9 * * 1-5", () => void remind("0905"), zone);
  cron.schedule("20 8 * * 1-5", () => void syncConstituents().catch((error) => {
    console.error("[worker] instrument sync failed", error);
  }), zone);
  cron.schedule("40 15 * * 1-5", () => void reconcile(), zone);
  cron.schedule("10 16 * * *", () => void pruneOldData(), zone);
  setInterval(() => void controlLoop().catch((error) => console.error(error)), 5000);
  setInterval(() => publishForming(), 1000);
  setInterval(() => void flushQuotes().catch((error) => console.error(error)), 2000);
  setInterval(() => void checkStale().catch((error) => console.error(error)), 10000);
  setInterval(() => void runJobs().catch((error) => console.error(error)), 3000);
  await controlLoop();
  void remindIfMorning().catch((error) => console.error("[worker] auth reminder failed", error));
  console.log("[worker] listening");
}

process.on("SIGTERM", () => {
  stopFeed();
  process.exit(0);
});

void main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
