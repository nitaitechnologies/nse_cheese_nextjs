import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { closeDb } from "./sqlite";
import {
  claimJob,
  claimNotice,
  enqueueJob,
  getDayCandles,
  getPreviousDaily,
  getSettings,
  listSessionLastCloses,
  saveDayCandles,
  saveSettings,
  upsertDailyBars,
  upsertQuotes,
} from "./store";

const dir = mkdtempSync(path.join(tmpdir(), "nse-sqlite-"));
process.env.SQLITE_PATH = path.join(dir, "test.sqlite");

after(() => {
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("settings round-trip through the sqlite file", async () => {
  const initial = await getSettings();
  assert.equal(initial.minStrength, 3);
  assert.equal(initial.backfillDays, 30);
  const saved = await saveSettings({ minStrength: 4, backfillDays: 12 });
  assert.equal(saved.minStrength, 4);
  assert.equal(saved.backfillDays, 12);
  assert.equal(saved.pushoverMutedDate, null);
});

test("a second job of the same type is not queued twice", async () => {
  const first = await enqueueJob("backfill", 5);
  const second = await enqueueJob("backfill", 9);
  assert.equal(second._id, first._id);
  const claimed = await claimJob();
  assert.equal(claimed?._id, first._id);
  assert.equal(claimed?.status, "running");
  assert.equal(await claimJob(), null);
});

test("a notice can be claimed once", async () => {
  assert.equal(await claimNotice("kite-auth-test"), true);
  assert.equal(await claimNotice("kite-auth-test"), false);
});

test("candles and the previous daily bar are readable", async () => {
  await upsertDailyBars([
    {
      instrument_token: 1,
      tradingsymbol: "ABC",
      date: "2026-10-09",
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
    },
  ]);
  await saveDayCandles({
    instrument_token: 1,
    tradingsymbol: "ABC",
    date: "2026-10-09",
    candles: [
      { time: "09:15", ts: 1, open: 10, high: 11, low: 9, close: 10.5, volume: 40 },
      { time: "09:20", ts: 2, open: 10.5, high: 12, low: 10, close: 11, volume: 60 },
    ],
  });
  const previous = await getPreviousDaily(1, "2026-10-10");
  assert.equal(previous?.close, 11);
  const candles = await getDayCandles(1, "2026-10-09");
  assert.equal(candles.length, 2);
  const closes = await listSessionLastCloses([1], "2026-10-09");
  assert.equal(closes.get(1), 11);
});

test("quote flush keeps an existing previous close", async () => {
  await upsertQuotes([
    {
      instrument_token: 1,
      tradingsymbol: "ABC",
      last_price: 11,
      prev_close: 10,
      forming: null,
      date: "2026-10-10",
      updatedAt: new Date("2026-10-10T04:00:00.000Z"),
    },
  ]);
  await upsertQuotes([
    {
      instrument_token: 1,
      tradingsymbol: "ABC",
      last_price: 11.5,
      prev_close: null,
      forming: null,
      date: "2026-10-10",
      updatedAt: new Date("2026-10-10T04:00:02.000Z"),
    },
  ]);
  const { listQuotes } = await import("./store");
  const [quote] = await listQuotes([1]);
  assert.equal(quote?.last_price, 11.5);
  assert.equal(quote?.prev_close, 10);
});
