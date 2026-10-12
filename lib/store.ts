import type { WithId } from "mongodb";
import { classifyMove, isIndexSymbol, normalizeIndexSymbol, pickIndex, priceChange, tally } from "./breadth";
import { collection, readyDb } from "./mongo";
import { istDateString } from "./time";
import type {
  BreakEvent,
  Breadth,
  Candle,
  CandleDoc,
  CoverageDoc,
  DailyBarDoc,
  DashboardBreadth,
  IndexCard,
  IndexDoc,
  IndexMemberDoc,
  IndexRow,
  InstrumentDoc,
  JobDoc,
  JobType,
  KiteSessionDoc,
  Move,
  QuoteDoc,
  RuntimeDoc,
  SettingsDoc,
  BreakPickRow,
  PickDoc,
  PiePickDoc,
  SignalDoc,
  StockBoardRow,
  StockDoc,
  StockRow,
  WatchItem,
} from "./types";

const SETTINGS_ID = "app";

export async function getSettings(): Promise<SettingsDoc> {
  await readyDb();
  const settings = await collection<SettingsDoc>("settings");
  const doc = await settings.findOne({ _id: SETTINGS_ID });
  return {
    _id: SETTINGS_ID,
    minStrength: doc?.minStrength ?? 3,
    backfillDays: doc?.backfillDays ?? 30,
    pushoverMutedDate: doc?.pushoverMutedDate ?? null,
  };
}

export async function setPushoverMuted(muted: boolean): Promise<SettingsDoc> {
  await readyDb();
  const settings = await collection<SettingsDoc>("settings");
  await settings.updateOne(
    { _id: SETTINGS_ID },
    { $set: { pushoverMutedDate: muted ? istDateString(new Date()) : null } },
    { upsert: true },
  );
  return getSettings();
}

export async function saveSettings(input: {
  minStrength: number;
  backfillDays: number;
}): Promise<SettingsDoc> {
  await readyDb();
  const settings = await collection<SettingsDoc>("settings");
  await settings.updateOne(
    { _id: SETTINGS_ID },
    { $set: { minStrength: input.minStrength, backfillDays: input.backfillDays } },
    { upsert: true },
  );
  return getSettings();
}

export async function saveKiteSession(input: {
  accessToken: string;
  userId: string;
  userName: string;
  loginTime: Date;
}): Promise<void> {
  await readyDb();
  const sessions = await collection<KiteSessionDoc>("kite_sessions");
  await sessions.insertOne({
    access_token: input.accessToken,
    user_id: input.userId,
    user_name: input.userName,
    login_time: input.loginTime,
    login_date: istDateString(input.loginTime),
  });
}

export async function getKiteSession(date = istDateString(new Date())): Promise<KiteSessionDoc | null> {
  await readyDb();
  const sessions = await collection<KiteSessionDoc>("kite_sessions");
  return sessions.find({ login_date: date }).sort({ login_time: -1 }).limit(1).next();
}

export async function replaceInstruments(rows: InstrumentDoc[]): Promise<number> {
  if (rows.length === 0) throw new Error("Refusing to clear every instrument");
  await readyDb();
  const instruments = await collection<InstrumentDoc>("instruments");
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const slice = rows.slice(index, index + chunkSize);
    await instruments.bulkWrite(
      slice.map((row) => ({
        updateOne: {
          filter: { instrument_token: row.instrument_token },
          update: { $set: row },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  await instruments.deleteMany({
    instrument_token: { $nin: rows.map((row) => row.instrument_token) },
  });
  return rows.length;
}

export async function searchInstruments(query: string): Promise<InstrumentDoc[]> {
  await readyDb();
  const instruments = await collection<InstrumentDoc>("instruments");
  const safe = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!safe) return [];
  return instruments
    .find({
      $or: [
        { tradingsymbol: { $regex: `^${safe}`, $options: "i" } },
        { name: { $regex: safe, $options: "i" } },
      ],
    })
    .limit(20)
    .toArray();
}

export async function upsertDailyBars(rows: DailyBarDoc[]): Promise<void> {
  if (rows.length === 0) return;
  await readyDb();
  const bars = await collection<DailyBarDoc>("daily_bars");
  await bars.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { instrument_token: row.instrument_token, date: row.date },
        update: { $set: row },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function saveDayCandles(doc: CandleDoc): Promise<void> {
  await readyDb();
  const candles = await collection<CandleDoc>("candles_5m");
  await candles.updateOne(
    { instrument_token: doc.instrument_token, date: doc.date },
    { $set: doc },
    { upsert: true },
  );
}

export async function getDayCandles(token: number, date: string): Promise<Candle[]> {
  await readyDb();
  const candles = await collection<CandleDoc>("candles_5m");
  const doc = await candles.findOne({ instrument_token: token, date });
  return doc?.candles ?? [];
}

export async function getPreviousDaily(
  token: number,
  beforeDate: string,
): Promise<DailyBarDoc | null> {
  await readyDb();
  const bars = await collection<DailyBarDoc>("daily_bars");
  return bars
    .find({ instrument_token: token, date: { $lt: beforeDate } })
    .sort({ date: -1 })
    .limit(1)
    .next();
}

export async function listPreviousRanges(
  tokens: number[],
  beforeDate: string,
): Promise<Map<number, { high: number; low: number }>> {
  const map = new Map<number, { high: number; low: number }>();
  if (tokens.length === 0) return map;
  await readyDb();
  const bars = await collection<DailyBarDoc>("daily_bars");
  for (let index = 0; index < tokens.length; index += PRICE_CHUNK) {
    const slice = tokens.slice(index, index + PRICE_CHUNK);
    const rows = await bars
      .aggregate<{ _id: number; high: number; low: number }>([
        { $match: { instrument_token: { $in: slice }, date: { $lt: beforeDate } } },
        { $sort: { instrument_token: 1, date: -1 } },
        { $group: { _id: "$instrument_token", high: { $first: "$high" }, low: { $first: "$low" } } },
      ])
      .toArray();
    for (const row of rows) map.set(row._id, { high: row.high, low: row.low });
  }
  return map;
}

export async function listSessionLastCloses(tokens: number[], date: string): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (tokens.length === 0) return map;
  await readyDb();
  const candles = await collection<CandleDoc>("candles_5m");
  const docs = await candles
    .find(
      { instrument_token: { $in: tokens }, date },
      { projection: { instrument_token: 1, candles: { $slice: -1 } } },
    )
    .toArray();
  for (const doc of docs) {
    const close = doc.candles.at(-1)?.close;
    if (close != null) map.set(doc.instrument_token, close);
  }
  return map;
}

export async function getPreviousSessionCandles(
  token: number,
  beforeDate: string,
): Promise<Candle[]> {
  const previous = await getPreviousDaily(token, beforeDate);
  if (!previous) return [];
  return getDayCandles(token, previous.date);
}

export async function markCoverage(
  token: number,
  interval: CoverageDoc["interval"],
  dates: string[],
): Promise<void> {
  if (dates.length === 0) return;
  await readyDb();
  const coverage = await collection<CoverageDoc>("coverage");
  await coverage.bulkWrite(
    dates.map((date) => ({
      updateOne: {
        filter: { instrument_token: token, interval, date },
        update: { $set: { instrument_token: token, interval, date } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function missingCoverage(
  token: number,
  interval: CoverageDoc["interval"],
  dates: string[],
): Promise<string[]> {
  if (dates.length === 0) return [];
  await readyDb();
  const coverage = await collection<CoverageDoc>("coverage");
  const found = await coverage
    .find({ instrument_token: token, interval, date: { $in: dates } })
    .project({ date: 1 })
    .toArray();
  const have = new Set(found.map((row) => row.date));
  return dates.filter((date) => !have.has(date));
}

export async function upsertSignal(
  signal: Omit<SignalDoc, "notified" | "createdAt">,
): Promise<{ doc: SignalDoc; inserted: boolean }> {
  await readyDb();
  const signals = await collection<SignalDoc>("signals");
  const filter = {
    instrument_token: signal.instrument_token,
    date: signal.date,
    side: signal.side,
  };
  const result = await signals.updateOne(
    filter,
    {
      $set: signal,
      $setOnInsert: { notified: false, createdAt: new Date() },
    },
    { upsert: true },
  );
  const doc = await signals.findOne(filter);
  if (!doc) throw new Error("Signal was not stored");
  return { doc, inserted: result.upsertedCount === 1 };
}

export async function markSignalNotified(signal: Pick<SignalDoc, "instrument_token" | "date" | "side">): Promise<void> {
  await readyDb();
  const signals = await collection<SignalDoc>("signals");
  await signals.updateOne(
    {
      instrument_token: signal.instrument_token,
      date: signal.date,
      side: signal.side,
    },
    { $set: { notified: true } },
  );
}

export async function stockAlreadyNotified(token: number, date: string): Promise<boolean> {
  await readyDb();
  const signals = await collection<SignalDoc>("signals");
  const found = await signals.findOne(
    { instrument_token: token, date, notified: true },
    { projection: { _id: 1 } },
  );
  return Boolean(found);
}

export async function markStockNotified(token: number, date: string): Promise<void> {
  await readyDb();
  const signals = await collection<SignalDoc>("signals");
  await signals.updateMany(
    { instrument_token: token, date },
    { $set: { notified: true } },
  );
}

export async function listSignals(date: string): Promise<SignalDoc[]> {
  await readyDb();
  const signals = await collection<SignalDoc>("signals");
  return signals.find({ date }).sort({ time: -1 }).toArray();
}

export async function listSignalsForToken(token: number, date: string): Promise<SignalDoc[]> {
  await readyDb();
  const signals = await collection<SignalDoc>("signals");
  return signals.find({ instrument_token: token, date }).sort({ time: 1 }).toArray();
}

export async function deleteAbsentSignals(
  token: number,
  date: string,
  sides: Array<SignalDoc["side"]>,
): Promise<void> {
  await readyDb();
  const signals = await collection<SignalDoc>("signals");
  await signals.deleteMany({
    instrument_token: token,
    date,
    side: { $nin: sides },
  });
}

export async function requeueInterruptedJobs(): Promise<void> {
  await readyDb();
  const jobs = await collection<JobDoc>("jobs");
  await jobs.updateMany(
    { status: "running" },
    { $set: { status: "queued", updatedAt: new Date() } },
  );
}

export async function enqueueJob(type: JobType, days?: number): Promise<WithId<JobDoc>> {
  await readyDb();
  const jobs = await collection<JobDoc>("jobs");
  const existing = await jobs.findOne({
    type,
    status: { $in: ["queued", "running"] },
  });
  if (existing) return existing;
  const now = new Date();
  const doc: JobDoc = {
    type,
    status: "queued",
    days,
    progress: { done: 0, total: 0, message: "Queued" },
    createdAt: now,
    updatedAt: now,
  };
  const result = await jobs.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function latestJob(): Promise<WithId<JobDoc> | null> {
  await readyDb();
  const jobs = await collection<JobDoc>("jobs");
  return jobs.find({}).sort({ createdAt: -1 }).limit(1).next();
}

export async function claimJob(): Promise<WithId<JobDoc> | null> {
  await readyDb();
  const jobs = await collection<JobDoc>("jobs");
  return jobs.findOneAndUpdate(
    { status: "queued" },
    { $set: { status: "running", updatedAt: new Date() } },
    { sort: { createdAt: 1 } },
  );
}

export async function updateJob(
  id: WithId<JobDoc>["_id"],
  patch: Partial<Pick<JobDoc, "status" | "progress" | "error">>,
): Promise<void> {
  await readyDb();
  const jobs = await collection<JobDoc>("jobs");
  await jobs.updateOne({ _id: id }, { $set: { ...patch, updatedAt: new Date() } });
}

export async function writeRuntime(doc: Omit<RuntimeDoc, "_id" | "updatedAt">): Promise<void> {
  await readyDb();
  const runtime = await collection<RuntimeDoc>("runtime");
  await runtime.updateOne(
    { _id: "worker" },
    { $set: { ...doc, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function readRuntime(): Promise<RuntimeDoc | null> {
  await readyDb();
  const runtime = await collection<RuntimeDoc>("runtime");
  return runtime.findOne({ _id: "worker" });
}

export async function upsertQuotes(rows: QuoteDoc[]): Promise<void> {
  if (rows.length === 0) return;
  await readyDb();
  const quotes = await collection<QuoteDoc>("quotes");
  await quotes.bulkWrite(
    rows.map((row) => {
      const set: Record<string, unknown> = {
        instrument_token: row.instrument_token,
        tradingsymbol: row.tradingsymbol,
        last_price: row.last_price,
        forming: row.forming,
        date: row.date,
        updatedAt: row.updatedAt,
      };
      if (row.prev_close != null && Number.isFinite(row.prev_close) && row.prev_close > 0) {
        set.prev_close = row.prev_close;
      }
      return {
        updateOne: {
          filter: { instrument_token: row.instrument_token },
          update: { $set: set },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );
}

export async function listQuotes(tokens: number[]): Promise<QuoteDoc[]> {
  if (tokens.length === 0) return [];
  await readyDb();
  const quotes = await collection<QuoteDoc>("quotes");
  return quotes.find({ instrument_token: { $in: tokens } }).toArray();
}

export async function claimNotice(id: string): Promise<boolean> {
  await readyDb();
  const notices = await collection<{ _id: string; createdAt: Date }>("notices");
  const result = await notices.updateOne(
    { _id: id },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  return result.upsertedCount === 1;
}

export async function clearNotice(id: string): Promise<void> {
  await readyDb();
  const notices = await collection<{ _id: string }>("notices");
  await notices.deleteOne({ _id: id });
}

export async function findInstrument(token: number): Promise<InstrumentDoc | null> {
  await readyDb();
  const instruments = await collection<InstrumentDoc>("instruments");
  return instruments.findOne({ instrument_token: token });
}

export async function countInstruments(): Promise<number> {
  await readyDb();
  const instruments = await collection<InstrumentDoc>("instruments");
  return instruments.countDocuments();
}

export async function listEquityInstruments(): Promise<InstrumentDoc[]> {
  await readyDb();
  const instruments = await collection<InstrumentDoc>("instruments");
  return instruments.find({ instrument_type: "EQ" }).toArray();
}

export async function listIndexInstruments(): Promise<InstrumentDoc[]> {
  await readyDb();
  const instruments = await collection<InstrumentDoc>("instruments");
  return instruments.find({ instrument_type: "INDEX" }).toArray();
}

export async function listFeedTargets(): Promise<WatchItem[]> {
  await readyDb();
  const [stockRows, indexRows] = await Promise.all([
    collection<StockDoc>("stocks").then((rows) => rows.find({}).toArray()),
    collection<IndexDoc>("indices").then((rows) => rows.find({}).toArray()),
  ]);
  const items = new Map<number, WatchItem>();
  for (const row of stockRows) {
    items.set(row.instrument_token, {
      instrument_token: row.instrument_token,
      tradingsymbol: row.tradingsymbol,
      name: row.name,
      addedAt: row.addedAt,
    });
  }
  for (const row of indexRows) {
    if (row.instrument_token == null || items.has(row.instrument_token)) continue;
    items.set(row.instrument_token, {
      instrument_token: row.instrument_token,
      tradingsymbol: row.symbol,
      name: row.name,
      addedAt: row.createdAt,
    });
  }
  return [...items.values()].sort((a, b) => a.tradingsymbol.localeCompare(b.tradingsymbol));
}

export type IndexMembership = {
  symbol: string;
  name: string;
  instrument_token: number | null;
  members: Array<{
    instrument_token: number;
    tradingsymbol: string;
    name: string;
  }>;
};

export async function replaceIndexMemberships(
  books: IndexMembership[],
): Promise<{ indices: number; stocks: number; links: number }> {
  if (books.length === 0) return { indices: 0, stocks: 0, links: 0 };
  await readyDb();
  const indices = await collection<IndexDoc>("indices");
  const stocks = await collection<StockDoc>("stocks");
  const members = await collection<IndexMemberDoc>("index_members");
  const now = new Date();
  const stockRows = new Map<number, IndexMembership["members"][number]>();
  let links = 0;
  for (const book of books) {
    const symbol = normalizeIndexSymbol(book.symbol);
    if (!isIndexSymbol(symbol)) throw new Error(`Invalid index symbol ${book.symbol}`);
    const name = book.name.trim().replace(/\s+/g, " ").slice(0, 80) || symbol;
    if (book.members.length === 0) throw new Error(`Refusing to clear ${symbol}`);
    const fields: { name: string; instrument_token?: number } = { name };
    if (book.instrument_token != null) fields.instrument_token = book.instrument_token;
    await indices.updateOne(
      { symbol },
      { $set: fields, $setOnInsert: { symbol, createdAt: now } },
      { upsert: true },
    );
    await members.bulkWrite(
      book.members.map((member) => ({
        updateOne: {
          filter: { symbol, instrument_token: member.instrument_token },
          update: {
            $set: {
              symbol,
              instrument_token: member.instrument_token,
              tradingsymbol: member.tradingsymbol,
              name: member.name,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    const tokens = book.members.map((member) => member.instrument_token);
    await members.deleteMany({ symbol, instrument_token: { $nin: tokens } });
    for (const member of book.members) stockRows.set(member.instrument_token, member);
    links += book.members.length;
  }
  const rows = [...stockRows.values()];
  const chunkSize = 500;
  const keptSymbols = books.map((book) => normalizeIndexSymbol(book.symbol));
  const storedIndexes = await indices.find({ symbol: { $in: keptSymbols } }).toArray();
  const indexTokens = storedIndexes
    .map((row) => row.instrument_token)
    .filter((token): token is number => token != null);
  const keptTokens = [...new Set([...rows.map((row) => row.instrument_token), ...indexTokens])];
  await indices.deleteMany({ symbol: { $nin: keptSymbols } });
  await members.deleteMany({
    $or: [{ symbol: { $nin: keptSymbols } }, { instrument_token: { $nin: keptTokens } }],
  });
  await stocks.deleteMany({ instrument_token: { $nin: keptTokens } });
  for (let index = 0; index < rows.length; index += chunkSize) {
    const slice = rows.slice(index, index + chunkSize);
    await stocks.bulkWrite(
      slice.map((member) => ({
        updateOne: {
          filter: { instrument_token: member.instrument_token },
          update: {
            $set: {
              tradingsymbol: member.tradingsymbol,
              name: member.name,
            },
            $setOnInsert: {
              instrument_token: member.instrument_token,
              addedAt: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  await dropOutside(keptTokens);
  return { indices: books.length, stocks: rows.length, links };
}

async function dropOutside(tokens: number[]): Promise<void> {
  const outside = { instrument_token: { $nin: tokens } };
  await Promise.all([
    collection<QuoteDoc>("quotes").then((rows) => rows.deleteMany(outside)),
    collection<CandleDoc>("candles_5m").then((rows) => rows.deleteMany(outside)),
    collection<DailyBarDoc>("daily_bars").then((rows) => rows.deleteMany(outside)),
    collection<SignalDoc>("signals").then((rows) => rows.deleteMany(outside)),
    collection<CoverageDoc>("coverage").then((rows) => rows.deleteMany(outside)),
    collection<PickDoc>("picks").then((rows) => rows.deleteMany(outside)),
  ]);
}

const PRICE_CHUNK = 1000;

function duplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function emptyIndex(symbol: string, name: string): IndexRow {
  return {
    symbol,
    name,
    count: 0,
    last: null,
    prevClose: null,
    change: null,
    changePct: null,
    advance: 0,
    decline: 0,
    unchanged: 0,
    unpriced: 0,
  };
}

export async function listIndices(): Promise<IndexRow[]> {
  await readyDb();
  const indices = await collection<IndexDoc>("indices");
  const members = await collection<IndexMemberDoc>("index_members");
  const [rows, links] = await Promise.all([
    indices.find({}).sort({ symbol: 1 }).toArray(),
    members.find({}).toArray(),
  ]);
  const bySymbol = new Map<string, number[]>();
  for (const link of links) {
    const list = bySymbol.get(link.symbol) ?? [];
    list.push(link.instrument_token);
    bySymbol.set(link.symbol, list);
  }
  const date = istDateString(new Date());
  const indexTokens = rows
    .map((row) => row.instrument_token)
    .filter((token): token is number => token != null);
  const [prices, moves] = await Promise.all([
    boardPrices(indexTokens, date),
    classifyTokens(
      links.map((link) => link.instrument_token),
      date,
    ),
  ]);
  return rows.map((row) => {
    const tokens = bySymbol.get(row.symbol) ?? [];
    const counts = sumMoves(tokens, moves);
    const price = row.instrument_token == null ? undefined : prices.get(row.instrument_token);
    const last = price?.last ?? null;
    const prevClose = price?.prevClose ?? null;
    return {
      ...emptyIndex(row.symbol, row.name),
      count: tokens.length,
      last,
      prevClose,
      ...priceChange(last, prevClose),
      advance: counts.advance,
      decline: counts.decline,
      unchanged: counts.unchanged,
      unpriced: counts.unpriced,
    };
  });
}

export async function createIndex(symbolInput: string, nameInput: string): Promise<IndexRow> {
  const symbol = normalizeIndexSymbol(symbolInput);
  if (!isIndexSymbol(symbol)) throw new Error("Use a short symbol such as NIFTY 50");
  const name = nameInput.trim().replace(/\s+/g, " ").slice(0, 80) || symbol;
  await readyDb();
  const indices = await collection<IndexDoc>("indices");
  try {
    await indices.insertOne({ symbol, name, createdAt: new Date() });
  } catch (error) {
    if (duplicateKey(error)) throw new Error("That index already exists");
    throw error;
  }
  return emptyIndex(symbol, name);
}

export async function renameIndex(symbolInput: string, nameInput: string): Promise<IndexRow> {
  const symbol = normalizeIndexSymbol(symbolInput);
  const name = nameInput.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) throw new Error("Enter a name");
  await readyDb();
  const indices = await collection<IndexDoc>("indices");
  const result = await indices.updateOne({ symbol }, { $set: { name } });
  if (result.matchedCount === 0) throw new Error("Index not found");
  const rows = await listIndices();
  const row = rows.find((item) => item.symbol === symbol);
  if (!row) throw new Error("Index not found");
  return row;
}

export async function deleteIndex(symbolInput: string): Promise<void> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  const indices = await collection<IndexDoc>("indices");
  const members = await collection<IndexMemberDoc>("index_members");
  const result = await indices.deleteOne({ symbol });
  await members.deleteMany({ symbol });
  await collection<PiePickDoc>("pie_picks").then((rows) => rows.deleteOne({ symbol }));
  if (result.deletedCount === 0) throw new Error("Index not found");
}

function groupEvents(signals: SignalDoc[]): Map<number, BreakEvent[]> {
  const map = new Map<number, BreakEvent[]>();
  for (const signal of signals) {
    const list = map.get(signal.instrument_token) ?? [];
    list.push({
      side: signal.side,
      time: signal.time,
      ts: signal.ts,
      close: signal.close,
      strength: signal.strength,
    });
    map.set(signal.instrument_token, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.ts - b.ts);
  return map;
}

export async function listStockBoard(date: string): Promise<StockBoardRow[]> {
  const [rows, signals] = await Promise.all([listStocks(), listSignals(date)]);
  const prices = await boardPrices(
    rows.map((row) => row.instrument_token),
    date,
  );
  const events = groupEvents(signals);
  return rows.map((row) => {
    const price = prices.get(row.instrument_token) ?? { last: null, prevClose: null };
    return {
      ...row,
      last: price.last,
      prevClose: price.prevClose,
      ...priceChange(price.last, price.prevClose),
      events: events.get(row.instrument_token) ?? [],
    };
  });
}

export async function listPicks(): Promise<PickDoc[]> {
  await readyDb();
  const picks = await collection<PickDoc>("picks");
  return picks.find({}).sort({ tradingsymbol: 1 }).toArray();
}

export async function addPick(token: number): Promise<PickDoc> {
  await readyDb();
  const stocks = await collection<StockDoc>("stocks");
  const stock = await stocks.findOne({ instrument_token: token });
  if (!stock) throw new Error("Stock is not in the book");
  const signals = await listSignalsForToken(token, istDateString(new Date()));
  if (signals.length === 0) throw new Error("That stock has not broken the previous high or low");
  const picks = await collection<PickDoc>("picks");
  const pickedAt = new Date();
  await picks.updateOne(
    { instrument_token: token },
    {
      $set: {
        tradingsymbol: stock.tradingsymbol,
        name: stock.name,
      },
      $setOnInsert: {
        instrument_token: token,
        pickedAt,
      },
    },
    { upsert: true },
  );
  const saved = await picks.findOne({ instrument_token: token });
  if (!saved) throw new Error("Could not store the stock");
  return saved;
}

export async function removePick(token: number): Promise<void> {
  await readyDb();
  const picks = await collection<PickDoc>("picks");
  await picks.deleteOne({ instrument_token: token });
}

export async function clearPicks(): Promise<void> {
  await readyDb();
  const picks = await collection<PickDoc>("picks");
  await picks.deleteMany({});
  await clearPiePicks();
}

export async function listPiePicks(): Promise<string[]> {
  await readyDb();
  const pies = await collection<PiePickDoc>("pie_picks");
  const rows = await pies.find({}).sort({ addedAt: 1 }).toArray();
  return rows.map((row) => row.symbol);
}

export async function addPiePick(symbolInput: string): Promise<string> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  const indices = await collection<IndexDoc>("indices");
  const index = await indices.findOne({ symbol });
  if (!index) throw new Error("Index not found");
  const pies = await collection<PiePickDoc>("pie_picks");
  await pies.updateOne(
    { symbol: index.symbol },
    { $setOnInsert: { symbol: index.symbol, addedAt: new Date() } },
    { upsert: true },
  );
  return index.symbol;
}

export async function removePiePick(symbolInput: string): Promise<void> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  const pies = await collection<PiePickDoc>("pie_picks");
  await pies.deleteOne({ symbol });
}

export async function clearPiePicks(): Promise<void> {
  await readyDb();
  const pies = await collection<PiePickDoc>("pie_picks");
  await pies.deleteMany({});
}

export async function listBreakRows(date: string): Promise<BreakPickRow[]> {
  const [board, picks] = await Promise.all([listStockBoard(date), listPicks()]);
  const picked = new Set(picks.map((pick) => pick.instrument_token));
  return board
    .filter((row) => row.events.length > 0)
    .map((row) => ({ ...row, picked: picked.has(row.instrument_token) }))
    .sort((a, b) => latestEvent(b) - latestEvent(a) || a.tradingsymbol.localeCompare(b.tradingsymbol));
}

export async function listPickRows(date: string): Promise<BreakPickRow[]> {
  const [picks, board] = await Promise.all([listPicks(), listStockBoard(date)]);
  const byToken = new Map(board.map((row) => [row.instrument_token, row]));
  return picks.map((pick) => ({
    ...(byToken.get(pick.instrument_token) ?? storedPickRow(pick)),
    picked: true,
  }));
}

function latestEvent(row: StockBoardRow): number {
  return row.events.reduce((latest, event) => Math.max(latest, event.ts), 0);
}

function storedPickRow(pick: PickDoc): StockBoardRow {
  return {
    instrument_token: pick.instrument_token,
    tradingsymbol: pick.tradingsymbol,
    name: pick.name,
    indices: [],
    last: null,
    prevClose: null,
    change: null,
    changePct: null,
    events: [],
  };
}

export async function listStocks(): Promise<StockRow[]> {
  await readyDb();
  const stocks = await collection<StockDoc>("stocks");
  const members = await collection<IndexMemberDoc>("index_members");
  const [rows, links] = await Promise.all([
    stocks.find({}).sort({ tradingsymbol: 1 }).toArray(),
    members.find({}).toArray(),
  ]);
  const byToken = new Map<number, string[]>();
  for (const link of links) {
    const list = byToken.get(link.instrument_token) ?? [];
    list.push(link.symbol);
    byToken.set(link.instrument_token, list);
  }
  return rows.map((row) => ({
    instrument_token: row.instrument_token,
    tradingsymbol: row.tradingsymbol,
    name: row.name,
    indices: (byToken.get(row.instrument_token) ?? []).sort(),
  }));
}

export async function addStock(token: number): Promise<StockRow> {
  await readyDb();
  const instrument = await findInstrument(token);
  if (!instrument) throw new Error("Instrument is not in the NSE equity list");
  const stocks = await collection<StockDoc>("stocks");
  await stocks.updateOne(
    { instrument_token: token },
    {
      $setOnInsert: {
        instrument_token: instrument.instrument_token,
        tradingsymbol: instrument.tradingsymbol,
        name: instrument.name,
        addedAt: new Date(),
      },
    },
    { upsert: true },
  );
  const linked = await listStocks();
  const row = linked.find((item) => item.instrument_token === token);
  if (!row) throw new Error("Could not store the stock");
  return row;
}

export async function replaceStockInstrument(token: number, nextToken: number): Promise<StockRow> {
  if (!Number.isInteger(token) || !Number.isInteger(nextToken) || token <= 0 || nextToken <= 0) {
    throw new Error("Choose a symbol from the list");
  }
  await readyDb();
  if (token === nextToken) {
    const rows = await listStocks();
    const row = rows.find((item) => item.instrument_token === token);
    if (!row) throw new Error("Stock is not in the book");
    return row;
  }
  const instrument = await findInstrument(nextToken);
  if (!instrument || instrument.instrument_type !== "EQ") throw new Error("Choose an NSE equity symbol");
  const stocks = await collection<StockDoc>("stocks");
  const current = await stocks.findOne({ instrument_token: token });
  if (!current) throw new Error("Stock is not in the book");
  const clash = await stocks.findOne({ instrument_token: nextToken });
  if (clash) throw new Error("That symbol is already in the book");
  await stocks.insertOne({
    instrument_token: instrument.instrument_token,
    tradingsymbol: instrument.tradingsymbol,
    name: instrument.name,
    addedAt: current.addedAt,
  });
  await stocks.deleteOne({ instrument_token: token });
  const members = await collection<IndexMemberDoc>("index_members");
  const links = await members.find({ instrument_token: token }).toArray();
  if (links.length > 0) {
    await members.deleteMany({ instrument_token: token });
    await members.bulkWrite(
      links.map((link) => ({
        updateOne: {
          filter: { symbol: link.symbol, instrument_token: nextToken },
          update: {
            $set: {
              symbol: link.symbol,
              instrument_token: nextToken,
              tradingsymbol: instrument.tradingsymbol,
              name: instrument.name,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  const picks = await collection<PickDoc>("picks");
  const picked = await picks.findOne({ instrument_token: token });
  if (picked) {
    await picks.deleteOne({ instrument_token: token });
    const alreadyPicked = await picks.findOne({ instrument_token: nextToken });
    if (!alreadyPicked) {
      await picks.insertOne({
        instrument_token: nextToken,
        tradingsymbol: instrument.tradingsymbol,
        name: instrument.name,
        pickedAt: picked.pickedAt,
      });
    }
  }
  const rows = await listStocks();
  const row = rows.find((item) => item.instrument_token === nextToken);
  if (!row) throw new Error("Could not store the stock");
  return row;
}

export async function removeStock(token: number): Promise<void> {
  await readyDb();
  const stocks = await collection<StockDoc>("stocks");
  const members = await collection<IndexMemberDoc>("index_members");
  const result = await stocks.deleteOne({ instrument_token: token });
  await members.deleteMany({ instrument_token: token });
  if (result.deletedCount === 0) throw new Error("Stock is not in the book");
  await collection<PickDoc>("picks").then((rows) => rows.deleteOne({ instrument_token: token }));
}

export async function linkStock(symbolInput: string, token: number): Promise<void> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  const indices = await collection<IndexDoc>("indices");
  const stocks = await collection<StockDoc>("stocks");
  const index = await indices.findOne({ symbol });
  if (!index) throw new Error("Create the index first");
  const stock = await stocks.findOne({ instrument_token: token });
  if (!stock) throw new Error("Add the stock first");
  const members = await collection<IndexMemberDoc>("index_members");
  await members.updateOne(
    { symbol, instrument_token: token },
    {
      $set: {
        symbol,
        instrument_token: token,
        tradingsymbol: stock.tradingsymbol,
        name: stock.name,
      },
    },
    { upsert: true },
  );
}

export async function unlinkStock(symbolInput: string, token: number): Promise<void> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  const members = await collection<IndexMemberDoc>("index_members");
  await members.deleteOne({ symbol, instrument_token: token });
}

async function boardPrices(
  tokens: number[],
  date: string,
): Promise<Map<number, { last: number | null; prevClose: number | null }>> {
  const unique = [...new Set(tokens)];
  const map = new Map<number, { last: number | null; prevClose: number | null }>();
  if (unique.length === 0) return map;
  const live = date === istDateString(new Date());
  const quotes = live ? await listQuotes(unique) : [];
  const quotePrev = new Map<number, number>();
  for (const quote of quotes) {
    if (quote.date === date && quote.prev_close != null && Number.isFinite(quote.prev_close) && quote.prev_close > 0) {
      quotePrev.set(quote.instrument_token, quote.prev_close);
    }
  }
  const [last, previous] = await Promise.all([lastPrices(unique, date), previousCloses(unique, date)]);
  for (const token of unique) {
    map.set(token, {
      last: last.get(token) ?? null,
      prevClose: quotePrev.get(token) ?? previous.get(token) ?? null,
    });
  }
  return map;
}

async function previousCloses(tokens: number[], beforeDate: string): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (tokens.length === 0) return map;
  const bars = await collection<DailyBarDoc>("daily_bars");
  for (let index = 0; index < tokens.length; index += PRICE_CHUNK) {
    const slice = tokens.slice(index, index + PRICE_CHUNK);
    const rows = await bars
      .aggregate<{ _id: number; close: number }>([
        { $match: { instrument_token: { $in: slice }, date: { $lt: beforeDate } } },
        { $sort: { instrument_token: 1, date: -1 } },
        { $group: { _id: "$instrument_token", close: { $first: "$close" } } },
      ])
      .toArray();
    for (const row of rows) map.set(row._id, row.close);
  }
  return map;
}

async function lastPrices(tokens: number[], date: string): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (tokens.length === 0) return map;
  if (date === istDateString(new Date())) {
    const quotes = await listQuotes(tokens);
    for (const quote of quotes) {
      if (quote.date === date && Number.isFinite(quote.last_price)) {
        map.set(quote.instrument_token, quote.last_price);
      }
    }
  }
  const missing = tokens.filter((token) => !map.has(token));
  if (missing.length === 0) return map;
  const bars = await collection<DailyBarDoc>("daily_bars");
  for (let index = 0; index < missing.length; index += PRICE_CHUNK) {
    const slice = missing.slice(index, index + PRICE_CHUNK);
    const rows = await bars.find({ instrument_token: { $in: slice }, date }).toArray();
    for (const row of rows) map.set(row.instrument_token, row.close);
  }
  return map;
}

async function classifyTokens(tokens: number[], date: string): Promise<Map<number, Move>> {
  const unique = [...new Set(tokens)];
  const [previous, last] = await Promise.all([previousCloses(unique, date), lastPrices(unique, date)]);
  const map = new Map<number, Move>();
  for (const token of unique) {
    map.set(token, classifyMove(last.get(token) ?? null, previous.get(token) ?? null));
  }
  return map;
}

function sumMoves(tokens: number[], moves: Map<number, Move>) {
  return tally([...new Set(tokens)].map((token) => moves.get(token) ?? "unpriced"));
}

export async function dashboardBreadth(date: string): Promise<DashboardBreadth> {
  await readyDb();
  const stocks = await collection<StockDoc>("stocks");
  const indices = await collection<IndexDoc>("indices");
  const members = await collection<IndexMemberDoc>("index_members");
  const [stockRows, indexRows] = await Promise.all([
    stocks.find({}).toArray(),
    indices.find({}).toArray(),
  ]);
  const nifty = pickIndex(indexRows, "nifty50");
  const bank = pickIndex(indexRows, "banknifty");
  const symbols = [nifty?.symbol, bank?.symbol].filter((symbol): symbol is string => Boolean(symbol));
  const memberRows = symbols.length === 0 ? [] : await members.find({ symbol: { $in: symbols } }).toArray();
  const niftyTokens = memberRows.filter((row) => row.symbol === nifty?.symbol).map((row) => row.instrument_token);
  const bankTokens = memberRows.filter((row) => row.symbol === bank?.symbol).map((row) => row.instrument_token);
  const marketTokens = stockRows.map((row) => row.instrument_token);
  const quoteTokens = [nifty?.instrument_token, bank?.instrument_token].filter(
    (token): token is number => token != null,
  );
  const [moves, prices] = await Promise.all([
    classifyTokens([...marketTokens, ...niftyTokens, ...bankTokens], date),
    boardPrices(quoteTokens, date),
  ]);
  const empty = tally([]);
  const blank = { last: null, prevClose: null, change: null, changePct: null };
  const quote = (index: IndexDoc | null | undefined) => {
    const price = index?.instrument_token == null ? undefined : prices.get(index.instrument_token);
    const last = price?.last ?? null;
    const prevClose = price?.prevClose ?? null;
    return { last, prevClose, ...priceChange(last, prevClose) };
  };
  return {
    market: { label: "Market", symbol: null, missing: false, ...sumMoves(marketTokens, moves), ...blank },
    nifty50: nifty
      ? { label: nifty.name, symbol: nifty.symbol, missing: false, ...sumMoves(niftyTokens, moves), ...quote(nifty) }
      : { label: "Nifty 50", symbol: null, missing: true, ...empty, ...blank },
    banknifty: bank
      ? { label: bank.name, symbol: bank.symbol, missing: false, ...sumMoves(bankTokens, moves), ...quote(bank) }
      : { label: "Bank Nifty", symbol: null, missing: true, ...empty, ...blank },
  };
}

export async function indexCardsForInstrument(token: number, date: string): Promise<IndexCard[]> {
  const breadths = await breadthForInstrument(token, date);
  if (breadths.length === 0) return [];
  const indices = await collection<IndexDoc>("indices");
  const symbols = breadths.map((row) => row.symbol).filter((symbol): symbol is string => Boolean(symbol));
  const docs = await indices.find({ symbol: { $in: symbols } }).toArray();
  const bySymbol = new Map(docs.map((doc) => [doc.symbol, doc]));
  const tokens = docs
    .map((doc) => doc.instrument_token)
    .filter((value): value is number => value != null);
  const prices = await boardPrices(tokens, date);
  return breadths.map((breadth) => {
    const doc = breadth.symbol ? bySymbol.get(breadth.symbol) : undefined;
    const price = doc?.instrument_token != null ? prices.get(doc.instrument_token) : undefined;
    const last = price?.last ?? null;
    const prevClose = price?.prevClose ?? null;
    return { ...breadth, last, prevClose, ...priceChange(last, prevClose) };
  });
}

export async function breadthForInstrument(token: number, date: string): Promise<Breadth[]> {
  await readyDb();
  const members = await collection<IndexMemberDoc>("index_members");
  const indices = await collection<IndexDoc>("indices");
  const links = await members.find({ instrument_token: token }).toArray();
  if (links.length === 0) return [];
  const symbols = [...new Set(links.map((link) => link.symbol))];
  const [indexRows, memberRows] = await Promise.all([
    indices.find({ symbol: { $in: symbols } }).toArray(),
    members.find({ symbol: { $in: symbols } }).toArray(),
  ]);
  const bySymbol = new Map<string, number[]>();
  for (const member of memberRows) {
    const list = bySymbol.get(member.symbol) ?? [];
    list.push(member.instrument_token);
    bySymbol.set(member.symbol, list);
  }
  const moves = await classifyTokens(
    memberRows.map((member) => member.instrument_token),
    date,
  );
  return indexRows
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((index) => ({
      label: index.name,
      symbol: index.symbol,
      missing: false,
      ...sumMoves(bySymbol.get(index.symbol) ?? [], moves),
    }));
}
