import { KiteTicker, type Tick, type Ticker } from "kiteconnect";
import { mergePreferHistory } from "../lib/candles";
import { env } from "../lib/env";
import {
  getDayCandles,
  getPreviousDaily,
  getPreviousSessionCandles,
  saveDayCandles,
  upsertQuotes,
} from "../lib/store";
import { bucketFromDate, istDateString, istTimestamp } from "../lib/time";
import type { Candle, QuoteDoc, WatchItem } from "../lib/types";
import { persistBreaks } from "./breaks";
import { broadcast } from "./stream";

type Book = {
  tradingsymbol: string;
  date: string;
  closed: Candle[];
  forming: Candle | null;
  volumeStart: number;
  lastCumulative: number | null;
  pdh: number | null;
  pdl: number | null;
  prior: Candle[];
  ready: boolean;
  lastPrice: number | null;
  prevClose: number | null;
};

const books = new Map<number, Book>();
let ticker: Ticker | null = null;
let activeToken: string | null = null;
let wanted: WatchItem[] = [];
let subscribed: number[] = [];
let filling = false;
let connectedAt = 0;
let lastTickAt: number | null = null;

export function feedConnected(): boolean {
  return Boolean(ticker?.connected());
}

export function lastTick(): number | null {
  return lastTickAt;
}

export function connectedSince(): number {
  return connectedAt;
}

export function feedSize(): number {
  return wanted.length;
}

function tickStamp(tick: Tick): Date | null {
  if ("last_trade_time" in tick && tick.last_trade_time) return tick.last_trade_time;
  if ("exchange_timestamp" in tick && tick.exchange_timestamp) return tick.exchange_timestamp;
  return null;
}

function tickVolume(tick: Tick): number {
  return "volume_traded" in tick && typeof tick.volume_traded === "number" ? tick.volume_traded : 0;
}

function emptyBook(item: WatchItem, date: string): Book {
  return {
    tradingsymbol: item.tradingsymbol,
    date,
    closed: [],
    forming: null,
    volumeStart: 0,
    lastCumulative: null,
    pdh: null,
    pdl: null,
    prior: [],
    ready: false,
    lastPrice: null,
    prevClose: null,
  };
}

async function closeCandle(token: number, book: Book, candle: Candle): Promise<void> {
  const stored = await getDayCandles(token, book.date);
  book.closed = mergePreferHistory(stored, [candle], null);
  await saveDayCandles({
    instrument_token: token,
    tradingsymbol: book.tradingsymbol,
    date: book.date,
    candles: book.closed,
  });
  await persistBreaks({
    instrumentToken: token,
    tradingsymbol: book.tradingsymbol,
    date: book.date,
    candles: book.closed,
    priorCandles: book.prior,
    pdh: book.pdh,
    pdl: book.pdl,
    allowNotify: true,
    replace: false,
  });
}

function finishForming(token: number, book: Book): void {
  if (!book.forming) return;
  const closed = book.forming;
  book.forming = null;
  void closeCandle(token, book, closed).catch((error) => {
    console.error("[worker] candle close failed", error);
  });
}

function onTicks(ticks: Tick[]): void {
  lastTickAt = Date.now();
  for (const tick of ticks) {
    const book = books.get(tick.instrument_token);
    if (!book) continue;
    const price = tick.last_price;
    if (!Number.isFinite(price)) continue;
    book.lastPrice = price;
    if ("ohlc" in tick && typeof tick.ohlc?.close === "number" && tick.ohlc.close > 0) {
      book.prevClose = tick.ohlc.close;
    }
    const stamp = tickStamp(tick);
    if (!stamp) continue;
    const bucket = bucketFromDate(stamp);
    if (!bucket || bucket.date !== book.date) {
      finishForming(tick.instrument_token, book);
      continue;
    }
    const cumulative = tickVolume(tick);
    if (!book.forming || book.forming.time !== bucket.time) {
      finishForming(tick.instrument_token, book);
      book.volumeStart = book.lastCumulative ?? 0;
      book.forming = {
        time: bucket.time,
        ts: istTimestamp(book.date, bucket.time),
        open: price,
        high: price,
        low: price,
        close: price,
        volume: Math.max(0, cumulative - book.volumeStart),
      };
    } else {
      book.forming.high = Math.max(book.forming.high, price);
      book.forming.low = Math.min(book.forming.low, price);
      book.forming.close = price;
      book.forming.volume = Math.max(0, cumulative - book.volumeStart);
    }
    book.lastCumulative = cumulative;
  }
}

export function publishForming(): void {
  for (const [token, book] of books) {
    if (!book.forming) continue;
    broadcast("candle", {
      instrument_token: token,
      tradingsymbol: book.tradingsymbol,
      date: book.date,
      candle: book.forming,
      forming: true,
    });
  }
}

export async function flushQuotes(): Promise<void> {
  const rows: QuoteDoc[] = [];
  for (const [token, book] of books) {
    const last = book.lastPrice ?? book.forming?.close ?? book.closed.at(-1)?.close;
    if (last == null) continue;
    rows.push({
      instrument_token: token,
      tradingsymbol: book.tradingsymbol,
      last_price: last,
      prev_close: book.prevClose,
      forming: book.forming,
      date: book.date,
      updatedAt: new Date(),
    });
  }
  await upsertQuotes(rows);
}

async function hydrateBooks(): Promise<void> {
  if (filling) return;
  const today = istDateString(new Date());
  const pending = wanted.filter((item) => {
    const book = books.get(item.instrument_token);
    return !book?.ready || book.date !== today;
  });
  if (pending.length === 0) return;
  filling = true;
  try {
    for (const item of pending) {
      const [candles, previous, prior] = await Promise.all([
        getDayCandles(item.instrument_token, today),
        getPreviousDaily(item.instrument_token, today),
        getPreviousSessionCandles(item.instrument_token, today),
      ]);
      const book = books.get(item.instrument_token) ?? emptyBook(item, today);
      book.tradingsymbol = item.tradingsymbol;
      book.date = today;
      book.closed = mergePreferHistory(candles, book.closed, book.forming?.time ?? null);
      book.pdh = previous?.high ?? null;
      book.pdl = previous?.low ?? null;
      book.prior = prior;
      book.ready = true;
      books.set(item.instrument_token, book);
    }
  } catch (error) {
    console.error("[worker] candle hydrate failed", error);
  } finally {
    filling = false;
  }
}

function subscribeAll(force = false): void {
  if (!ticker) return;
  const tokens = wanted.map((item) => item.instrument_token);
  const same =
    !force &&
    tokens.length === subscribed.length &&
    tokens.every((token, index) => token === subscribed[index]);
  if (same) return;
  if (subscribed.length > 0) ticker.unsubscribe(subscribed);
  if (tokens.length > 0) {
    ticker.subscribe(tokens);
    ticker.setMode(ticker.modeFull, tokens);
  }
  subscribed = tokens;
}

function connect(accessToken: string): void {
  ticker?.disconnect();
  subscribed = [];
  const next = new KiteTicker({
    api_key: env("KITE_API_KEY"),
    access_token: accessToken,
  });
  ticker = next;
  activeToken = accessToken;
  next.on("connect", () => {
    connectedAt = Date.now();
    subscribeAll(true);
    void hydrateBooks();
  });
  next.on("ticks", onTicks);
  next.on("disconnect", () => {
    console.log("[worker] kite socket disconnected");
  });
  next.on("error", (error) => {
    console.error("[worker] kite socket error", error);
  });
  next.on("noreconnect", () => {
    console.error("[worker] kite socket stopped reconnecting");
  });
  next.connect();
}

export async function syncFeed(accessToken: string | null, items: WatchItem[]): Promise<void> {
  wanted = [...items].sort((a, b) => a.instrument_token - b.instrument_token);
  const today = istDateString(new Date());
  for (const item of wanted) {
    const book = books.get(item.instrument_token);
    if (!book || book.date !== today) {
      books.set(item.instrument_token, emptyBook(item, today));
    } else {
      book.tradingsymbol = item.tradingsymbol;
    }
  }
  for (const token of books.keys()) {
    if (!wanted.some((item) => item.instrument_token === token)) books.delete(token);
  }
  if (!accessToken) {
    ticker?.disconnect();
    ticker = null;
    activeToken = null;
    subscribed = [];
    return;
  }
  if (!ticker || activeToken !== accessToken) {
    connect(accessToken);
    return;
  }
  if (ticker.connected()) {
    subscribeAll();
    void hydrateBooks();
  }
}

export function stopFeed(): void {
  ticker?.disconnect();
  ticker = null;
}
