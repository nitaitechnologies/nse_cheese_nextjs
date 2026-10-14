import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { closeDb, one, run } from "./sqlite";
import { istTimestamp } from "./time";
import {
  claimJob,
  claimNotice,
  enqueueJob,
  getDayCandles,
  getKiteSession,
  getPreviousDaily,
  getSettings,
  listQuotes,
  listSessionLastCloses,
  listSignals,
  markCoverage,
  missingCoverage,
  pruneExpiredData,
  saveDayCandles,
  saveKiteSession,
  saveSettings,
  updateJob,
  upsertDailyBars,
  upsertQuotes,
  upsertSignal,
  addDeskPie,
  createIndex,
  dashboardBreadth,
  deleteIndex,
  listPieHistory,
  addPick,
  hideStock,
  listPicks,
  listStockBoard,
  removeDeskPie,
  unhideStock,
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
  assert.equal(initial.backfillDays, 15);
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
  const [quote] = await listQuotes([1]);
  assert.equal(quote?.last_price, 11.5);
  assert.equal(quote?.prev_close, 10);
});

test("data older than 15 days is removed", async () => {
  const asOf = new Date("2026-11-01T08:00:00.000Z");
  await upsertDailyBars([
    bar(9, "2026-10-06"),
    bar(9, "2026-10-07"),
  ]);
  await saveDayCandles({
    instrument_token: 9,
    tradingsymbol: "OLD",
    date: "2026-10-16",
    candles: [{ time: "09:15", ts: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
  });
  await saveDayCandles({
    instrument_token: 9,
    tradingsymbol: "OLD",
    date: "2026-10-17",
    candles: [{ time: "09:15", ts: 1, open: 2, high: 2, low: 2, close: 2, volume: 2 }],
  });
  await upsertSignal({
    instrument_token: 9,
    tradingsymbol: "OLD",
    date: "2026-10-16",
    side: "PDH",
    time: "09:20",
    ts: 1,
    close: 1,
    level: 1,
    volume: 1,
    strength: 3,
    volumeScore: 1,
    wickScore: 1,
    depthScore: 1,
    relativeVolume: null,
  });
  await markCoverage(9, "5minute", ["2026-10-16", "2026-10-17"]);
  await markCoverage(9, "day", ["2026-10-06", "2026-10-07"]);
  await upsertQuotes([
    {
      instrument_token: 9,
      tradingsymbol: "OLD",
      last_price: 1,
      prev_close: 1,
      forming: null,
      date: "2026-10-16",
      updatedAt: new Date("2026-10-16T04:00:00.000Z"),
    },
    {
      instrument_token: 10,
      tradingsymbol: "NEW",
      last_price: 2,
      prev_close: 2,
      forming: null,
      date: "2026-10-17",
      updatedAt: new Date("2026-10-17T04:00:00.000Z"),
    },
  ]);
  await saveKiteSession({
    accessToken: "stale",
    userId: "u",
    userName: "n",
    loginTime: new Date("2026-10-16T04:00:00.000Z"),
  });
  await saveKiteSession({
    accessToken: "fresh",
    userId: "u",
    userName: "n",
    loginTime: new Date("2026-10-17T04:00:00.000Z"),
  });
  const finished = await enqueueJob("instruments");
  await updateJob(finished._id, { status: "done", progress: { done: 1, total: 1, message: "done" } });
  run("UPDATE jobs SET created_at = ? WHERE id = ?", ["2026-10-01T00:00:00.000Z", Number(finished._id)]);
  await claimNotice("old-notice");
  run("UPDATE notices SET created_at = ? WHERE id = ?", ["2026-10-01T00:00:00.000Z", "old-notice"]);

  const { removed } = await pruneExpiredData(asOf);
  assert.ok(removed >= 6);
  assert.equal(await getPreviousDaily(9, "2026-10-07"), null);
  assert.equal((await getPreviousDaily(9, "2026-11-01"))?.date, "2026-10-07");
  assert.equal((await getDayCandles(9, "2026-10-16")).length, 0);
  assert.equal((await getDayCandles(9, "2026-10-17")).length, 1);
  assert.equal((await listSignals("2026-10-16")).length, 0);
  assert.deepEqual(await missingCoverage(9, "5minute", ["2026-10-16", "2026-10-17"]), ["2026-10-16"]);
  assert.deepEqual(await missingCoverage(9, "day", ["2026-10-06", "2026-10-07"]), ["2026-10-06"]);
  assert.equal((await listQuotes([9])).length, 0);
  assert.equal((await listQuotes([10])).length, 1);
  assert.equal(await getKiteSession("2026-10-16"), null);
  assert.equal((await getKiteSession("2026-10-17"))?.access_token, "fresh");
  assert.equal(one("SELECT id FROM notices WHERE id = ?", ["old-notice"]), undefined);
  assert.equal(one("SELECT id FROM jobs WHERE id = ?", [Number(finished._id)]), undefined);
  assert.equal(one("SELECT status FROM jobs WHERE type = ?", ["backfill"])?.status, "running");
});

test("pinned indices become extra desk pies", async () => {
  await createIndex("NIFTY IT", "Nifty IT");
  await createIndex("NIFTY 50", "Nifty 50");
  try {
    assert.equal(await addDeskPie("nifty it"), "NIFTY IT");
    assert.equal(await addDeskPie("NIFTY 50"), "NIFTY 50");
    const breadth = await dashboardBreadth("2026-10-14");
    assert.deepEqual(
      breadth.extras.map((item) => item.symbol),
      ["NIFTY IT", "NIFTY 50"],
    );
    assert.equal(breadth.nifty50.missing, false);
    assert.equal(breadth.nifty50.symbol, "NIFTY 50");
    await removeDeskPie("NIFTY IT");
    assert.deepEqual(
      (await dashboardBreadth("2026-10-14")).extras.map((item) => item.symbol),
      ["NIFTY 50"],
    );
    await removeDeskPie("NIFTY 50");
    assert.equal((await dashboardBreadth("2026-10-14")).extras.length, 0);
  } finally {
    await removeDeskPie("NIFTY IT");
    await removeDeskPie("NIFTY 50");
    for (const symbol of ["NIFTY IT", "NIFTY 50"]) {
      try {
        await deleteIndex(symbol);
      } catch {
        // The index was already removed.
      }
    }
  }
});

test("a hide stays on that session date only", async () => {
  run(
    `INSERT INTO stocks (instrument_token, tradingsymbol, name, added_at) VALUES (?, ?, ?, ?)`,
    [4242, "HIDE", "Hide Me", new Date().toISOString()],
  );
  try {
    await hideStock(4242, "2026-10-14");
    const hidden = await listStockBoard("2026-10-14");
    const prior = await listStockBoard("2026-10-13");
    assert.equal(hidden.find((row) => row.instrument_token === 4242)?.hidden, true);
    assert.equal(prior.find((row) => row.instrument_token === 4242)?.hidden, false);
    await unhideStock(4242, "2026-10-14");
    const shown = await listStockBoard("2026-10-14");
    assert.equal(shown.find((row) => row.instrument_token === 4242)?.hidden, false);
  } finally {
    run("DELETE FROM hides WHERE instrument_token = ?", [4242]);
    run("DELETE FROM stocks WHERE instrument_token = ?", [4242]);
  }
});

test("the first kite login of the day clears picks and hides", async () => {
  run(
    `INSERT INTO stocks (instrument_token, tradingsymbol, name, added_at) VALUES (?, ?, ?, ?)`,
    [4243, "MORN", "Morning", new Date().toISOString()],
  );
  try {
    await addPick(4243);
    await hideStock(4243, "2026-10-14");
    await saveKiteSession({
      accessToken: "morning",
      userId: "u",
      userName: "n",
      loginTime: new Date("2026-10-18T03:30:00.000Z"),
    });
    assert.equal(
      (await listPicks()).some((pick) => pick.instrument_token === 4243),
      false,
    );
    assert.equal(one("SELECT 1 AS found FROM hides WHERE instrument_token = ?", [4243]), undefined);

    await addPick(4243);
    await hideStock(4243, "2026-10-18");
    await saveKiteSession({
      accessToken: "later",
      userId: "u",
      userName: "n",
      loginTime: new Date("2026-10-18T05:00:00.000Z"),
    });
    assert.equal(
      (await listPicks()).some((pick) => pick.instrument_token === 4243),
      true,
    );
    assert.equal(
      one("SELECT instrument_token AS token FROM hides WHERE instrument_token = ?", [4243])?.token,
      4243,
    );
  } finally {
    run("DELETE FROM picks WHERE instrument_token = ?", [4243]);
    run("DELETE FROM hides WHERE instrument_token = ?", [4243]);
    run("DELETE FROM stocks WHERE instrument_token = ?", [4243]);
    run("DELETE FROM kite_sessions WHERE access_token IN ('morning', 'later')");
  }
});

test("pie replay walks 5-minute breadth from the open", async () => {
  await createIndex("PIE TEST", "Pie Test");
  run("UPDATE indices SET instrument_token = ? WHERE symbol = ?", [801, "PIE TEST"]);
  run(
    `INSERT INTO index_members (symbol, instrument_token, tradingsymbol, name)
     VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    ["PIE TEST", 901, "AAA", "Aaa", "PIE TEST", 902, "BBB", "Bbb"],
  );
  try {
    await upsertDailyBars([
      { instrument_token: 901, tradingsymbol: "AAA", date: "2026-10-13", open: 100, high: 100, low: 100, close: 100, volume: 1 },
      { instrument_token: 902, tradingsymbol: "BBB", date: "2026-10-13", open: 50, high: 50, low: 50, close: 50, volume: 1 },
      { instrument_token: 801, tradingsymbol: "PIE", date: "2026-10-13", open: 1000, high: 1000, low: 1000, close: 1000, volume: 1 },
    ]);
    await saveDayCandles({
      instrument_token: 901,
      tradingsymbol: "AAA",
      date: "2026-10-14",
      candles: [
        { time: "09:15", ts: istTimestamp("2026-10-14", "09:15"), open: 110, high: 110, low: 110, close: 110, volume: 1 },
        { time: "09:20", ts: istTimestamp("2026-10-14", "09:20"), open: 90, high: 90, low: 90, close: 90, volume: 1 },
      ],
    });
    await saveDayCandles({
      instrument_token: 902,
      tradingsymbol: "BBB",
      date: "2026-10-14",
      candles: [
        { time: "09:20", ts: istTimestamp("2026-10-14", "09:20"), open: 50, high: 50, low: 50, close: 50, volume: 1 },
      ],
    });
    await saveDayCandles({
      instrument_token: 801,
      tradingsymbol: "PIE",
      date: "2026-10-14",
      candles: [
        { time: "09:15", ts: istTimestamp("2026-10-14", "09:15"), open: 1010, high: 1010, low: 1010, close: 1010, volume: 1 },
        { time: "09:20", ts: istTimestamp("2026-10-14", "09:20"), open: 1005, high: 1005, low: 1005, close: 1005, volume: 1 },
      ],
    });
    await upsertQuotes([
      {
        instrument_token: 901,
        tradingsymbol: "AAA",
        last_price: 70,
        prev_close: 100,
        forming: null,
        date: "2026-10-14",
        updatedAt: new Date("2026-10-14T03:52:00.000Z"),
      },
      {
        instrument_token: 801,
        tradingsymbol: "PIE",
        last_price: 990,
        prev_close: 1000,
        forming: null,
        date: "2026-10-14",
        updatedAt: new Date("2026-10-14T03:52:00.000Z"),
      },
    ]);
    const [pie] = await listPieHistory("2026-10-14", "PIE TEST", new Date(istTimestamp("2026-10-14", "09:22") * 1000));
    assert.equal(pie?.label, "Pie Test");
    assert.equal(pie?.frames.length, 2);
    assert.equal(pie?.frames[0]?.time, "09:15");
    assert.equal(pie?.frames[0]?.advance, 1);
    assert.equal(pie?.frames[0]?.unpriced, 1);
    assert.equal(pie?.frames[0]?.last, 1010);
    assert.equal(pie?.frames[1]?.decline, 1);
    assert.equal(pie?.frames[1]?.unchanged, 1);
    assert.equal(pie?.frames[1]?.last, 990);
    assert.equal(pie?.frames[1]?.change, -10);
  } finally {
    try {
      await deleteIndex("PIE TEST");
    } catch {
      // The index was already removed.
    }
    run("DELETE FROM candles_5m WHERE instrument_token IN (801, 901, 902)");
    run("DELETE FROM daily_bars WHERE instrument_token IN (801, 901, 902)");
    run("DELETE FROM quotes WHERE instrument_token IN (801, 901, 902)");
  }
});

function bar(token: number, date: string) {
  return {
    instrument_token: token,
    tradingsymbol: "OLD",
    date,
    open: 1,
    high: 2,
    low: 1,
    close: 1,
    volume: 1,
  };
}
