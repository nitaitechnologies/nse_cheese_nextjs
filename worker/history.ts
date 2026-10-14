import {
  historicalToDaily,
  historicalToIntraday,
  mergePreferHistory,
  type RawBar,
} from "../lib/candles";
import {
  getDayCandles,
  getPreviousDaily,
  getPreviousSessionCandles,
  listFeedTargets,
  listStocks,
  markCoverage,
  missingCoverage,
  replaceInstruments,
  saveDayCandles,
  upsertDailyBars,
} from "../lib/store";
import { TRACKED_INDEX_SYMBOLS } from "../lib/nse-indices";
import { clampBackfillDays, DAILY_LOOKBACK_DAYS } from "../lib/retention";
import {
  addCalendarDays,
  chunkDates,
  isMarketOpen,
  istDateString,
  istDateTime,
  weekdayDates,
} from "../lib/time";
import type { Candle, InstrumentDoc } from "../lib/types";
import { persistBreaks } from "./breaks";
import { createKite, currentAccessToken, kiteCall } from "./kite";

const CHUNK_DAYS = 90;

async function fetchBars(
  token: number,
  interval: "day" | "5minute",
  from: string,
  to: string,
): Promise<RawBar[]> {
  const rows = await kiteCall((kc) =>
    kc.getHistoricalData(
      token,
      interval,
      istDateTime(from, "00:00"),
      istDateTime(to, "23:59"),
      false,
      false,
    ),
  );
  return rows;
}

export async function syncInstruments(symbols: ReadonlySet<string>): Promise<number> {
  if (symbols.size === 0) throw new Error("No index symbols to store");
  const trackedIndexes = new Set<string>(TRACKED_INDEX_SYMBOLS);
  const rows = await createKite(currentAccessToken() ?? undefined).getInstruments("NSE");
  const equities: InstrumentDoc[] = [];
  for (const row of rows) {
    if (row.exchange !== "NSE") continue;
    const tradingsymbol = row.tradingsymbol.toUpperCase();
    const token = Number(row.instrument_token);
    if (!Number.isFinite(token)) continue;
    const isIndex = row.segment === "INDICES" && trackedIndexes.has(tradingsymbol);
    const isEquity = row.instrument_type === "EQ" && row.segment !== "INDICES" && symbols.has(tradingsymbol);
    if (!isIndex && !isEquity) continue;
    equities.push({
      instrument_token: token,
      tradingsymbol,
      name: row.name || tradingsymbol,
      exchange: "NSE",
      instrument_type: isIndex ? "INDEX" : "EQ",
      tick_size: Number(row.tick_size) || 0.05,
    });
  }
  if (equities.length === 0) throw new Error("No Kite instruments matched the index stocks");
  await replaceInstruments(equities);
  return equities.length;
}

async function ensureDaily(
  token: number,
  symbol: string,
  from: string,
  to: string,
): Promise<void> {
  const today = istDateString(new Date());
  const end = to >= today && isMarketOpen() ? addCalendarDays(today, -1) : to;
  if (from > end) return;
  for (const chunk of chunkDates(from, end, CHUNK_DAYS)) {
    const dates = weekdayDates(chunk.from, chunk.to);
    const missing = await missingCoverage(token, "day", dates);
    if (missing.length === 0) continue;
    const rows = await fetchBars(token, "day", chunk.from, chunk.to);
    await upsertDailyBars(historicalToDaily(rows, token, symbol));
    const finished = dates.filter((date) => date < today || !isMarketOpen());
    await markCoverage(token, "day", finished);
  }
}

async function saveIntradayDay(
  token: number,
  symbol: string,
  date: string,
  historical: Candle[],
  allowNotify: boolean,
): Promise<void> {
  const today = istDateString(new Date());
  const existing = date === today ? await getDayCandles(token, date) : [];
  const candles = date === today ? mergePreferHistory(existing, historical, null) : historical;
  if (candles.length === 0) return;
  await saveDayCandles({
    instrument_token: token,
    tradingsymbol: symbol,
    date,
    candles,
  });
  const previous = await getPreviousDaily(token, date);
  const prior = await getPreviousSessionCandles(token, date);
  await persistBreaks({
    instrumentToken: token,
    tradingsymbol: symbol,
    date,
    candles,
    priorCandles: prior,
    pdh: previous?.high ?? null,
    pdl: previous?.low ?? null,
    allowNotify: allowNotify && date === today,
    replace: date !== today,
  });
}

async function pullIntraday(
  token: number,
  symbol: string,
  from: string,
  to: string,
  allowNotify: boolean,
): Promise<void> {
  const rows = await fetchBars(token, "5minute", from, to);
  const grouped = historicalToIntraday(rows);
  for (const date of weekdayDates(from, to)) {
    await saveIntradayDay(token, symbol, date, grouped.get(date) ?? [], allowNotify);
  }
}

async function ensureIntraday(
  token: number,
  symbol: string,
  from: string,
  to: string,
  allowNotify: boolean,
): Promise<void> {
  const today = istDateString(new Date());
  const pastTo = to < today ? to : addCalendarDays(today, -1);
  if (from <= pastTo) {
    for (const chunk of chunkDates(from, pastTo, CHUNK_DAYS)) {
      const dates = weekdayDates(chunk.from, chunk.to);
      const missing = await missingCoverage(token, "5minute", dates);
      if (missing.length === 0) continue;
      await pullIntraday(token, symbol, chunk.from, chunk.to, false);
      await markCoverage(token, "5minute", dates);
    }
  }
  if (from <= today && to >= today) {
    await pullIntraday(token, symbol, today, today, allowNotify);
    if (!isMarketOpen()) await markCoverage(token, "5minute", [today]);
  }
}

export async function backfillSymbol(
  token: number,
  symbol: string,
  days: number,
): Promise<void> {
  const today = istDateString(new Date());
  const from = addCalendarDays(today, -clampBackfillDays(days));
  const dailyFrom = addCalendarDays(from, -DAILY_LOOKBACK_DAYS);
  await ensureDaily(token, symbol, dailyFrom, today);
  await ensureIntraday(token, symbol, from, today, false);
}

export async function healSymbol(token: number, symbol: string): Promise<{
  candles: Candle[];
  prior: Candle[];
  pdh: number | null;
  pdl: number | null;
}> {
  const today = istDateString(new Date());
  const dailyFrom = addCalendarDays(today, -15);
  await ensureDaily(token, symbol, dailyFrom, today);
  const previous = await getPreviousDaily(token, today);
  const rows = await fetchBars(token, "5minute", today, today);
  const historical = historicalToIntraday(rows).get(today) ?? [];
  const existing = await getDayCandles(token, today);
  const candles = mergePreferHistory(existing, historical, null);
  if (candles.length > 0) {
    await saveDayCandles({
      instrument_token: token,
      tradingsymbol: symbol,
      date: today,
      candles,
    });
  }
  await markCoverage(token, "5minute", [today]);
  const prior = await getPreviousSessionCandles(token, today);
  await persistBreaks({
    instrumentToken: token,
    tradingsymbol: symbol,
    date: today,
    candles,
    priorCandles: prior,
    pdh: previous?.high ?? null,
    pdl: previous?.low ?? null,
    allowNotify: true,
    replace: false,
  });
  return {
    candles,
    prior,
    pdh: previous?.high ?? null,
    pdl: previous?.low ?? null,
  };
}

export async function reconcileSymbol(token: number, symbol: string): Promise<void> {
  const today = istDateString(new Date());
  await ensureDaily(token, symbol, addCalendarDays(today, -10), today);
  const rows = await fetchBars(token, "5minute", today, today);
  const candles = historicalToIntraday(rows).get(today) ?? [];
  await saveDayCandles({
    instrument_token: token,
    tradingsymbol: symbol,
    date: today,
    candles,
  });
  await markCoverage(token, "5minute", [today]);
  const previous = await getPreviousDaily(token, today);
  const prior = await getPreviousSessionCandles(token, today);
  await persistBreaks({
    instrumentToken: token,
    tradingsymbol: symbol,
    date: today,
    candles,
    priorCandles: prior,
    pdh: previous?.high ?? null,
    pdl: previous?.low ?? null,
    allowNotify: false,
    replace: true,
  });
}

export async function backfillStocks(
  days: number,
  onProgress: (done: number, total: number, message: string) => Promise<void>,
): Promise<void> {
  const targets = await listFeedTargets();
  if (targets.length === 0) throw new Error("Refresh instruments before backfilling");
  for (let index = 0; index < targets.length; index += 1) {
    const item = targets[index];
    await onProgress(index, targets.length, `Backfilling ${item.tradingsymbol}`);
    await backfillSymbol(item.instrument_token, item.tradingsymbol, days);
  }
  await onProgress(targets.length, targets.length, "Backfill complete");
}

export async function reconcileStocks(
  onProgress: (done: number, total: number, message: string) => Promise<void>,
): Promise<void> {
  const stocks = await listStocks();
  for (let index = 0; index < stocks.length; index += 1) {
    const item = stocks[index];
    await onProgress(index, stocks.length, `Reconciling ${item.tradingsymbol}`);
    await reconcileSymbol(item.instrument_token, item.tradingsymbol);
  }
}
