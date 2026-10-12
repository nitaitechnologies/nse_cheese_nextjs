import { classifyMove, isIndexSymbol, normalizeIndexSymbol, pickIndex, priceChange, tally } from "./breadth";
import { detectProbes } from "./signals";
import { all, duplicateKey, fillKeptTokens, getDb, one, readyDb, run, transaction, type Row } from "./sqlite";
import { istDateString } from "./time";
import type {
  BreakEvent,
  BreakPickRow,
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
  PickDoc,
  QuoteDoc,
  RuntimeDoc,
  SettingsDoc,
  SignalDoc,
  StockBoardRow,
  StockDoc,
  StockRow,
  WatchItem,
} from "./types";

const SETTINGS_ID = "app";
const CHUNK = 400;

export type StoredJob = JobDoc & { _id: string };

type Sql = string | number | null;

function text(row: Row, key: string): string {
  const value = row[key];
  return value == null ? "" : String(value);
}

function num(row: Row, key: string): number {
  return Number(row[key]);
}

function maybeNum(row: Row, key: string): number | null {
  const value = row[key];
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function date(row: Row, key: string): Date {
  return new Date(text(row, key));
}

function flag(row: Row, key: string): boolean {
  return Number(row[key]) === 1;
}

function json<T>(value: T): string {
  return JSON.stringify(value);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function chunks<T>(values: T[]): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += CHUNK) groups.push(values.slice(index, index + CHUNK));
  return groups;
}

function like(query: string, mode: "prefix" | "contains"): string {
  const escaped = query.replace(/\\/g, "\\\\").replace(/[%_]/g, (char) => `\\${char}`);
  return mode === "prefix" ? `${escaped}%` : `%${escaped}%`;
}

function instrument(row: Row): InstrumentDoc {
  return {
    instrument_token: num(row, "instrument_token"),
    tradingsymbol: text(row, "tradingsymbol"),
    name: text(row, "name"),
    exchange: "NSE",
    instrument_type: text(row, "instrument_type") === "INDEX" ? "INDEX" : "EQ",
    tick_size: num(row, "tick_size"),
  };
}

function dailyBar(row: Row): DailyBarDoc {
  return {
    instrument_token: num(row, "instrument_token"),
    tradingsymbol: text(row, "tradingsymbol"),
    date: text(row, "date"),
    open: num(row, "open"),
    high: num(row, "high"),
    low: num(row, "low"),
    close: num(row, "close"),
    volume: num(row, "volume"),
  };
}

function signal(row: Row): SignalDoc {
  const relative = maybeNum(row, "relative_volume");
  return {
    instrument_token: num(row, "instrument_token"),
    tradingsymbol: text(row, "tradingsymbol"),
    date: text(row, "date"),
    side: text(row, "side") === "PDL" ? "PDL" : "PDH",
    time: text(row, "time"),
    ts: num(row, "ts"),
    close: num(row, "close"),
    level: num(row, "level"),
    volume: num(row, "volume"),
    strength: num(row, "strength"),
    volumeScore: num(row, "volume_score"),
    wickScore: num(row, "wick_score"),
    depthScore: num(row, "depth_score"),
    relativeVolume: relative,
    notified: flag(row, "notified"),
    createdAt: date(row, "created_at"),
  };
}

function quote(row: Row): QuoteDoc {
  const forming = row.forming == null ? null : (JSON.parse(String(row.forming)) as Candle);
  return {
    instrument_token: num(row, "instrument_token"),
    tradingsymbol: text(row, "tradingsymbol"),
    last_price: num(row, "last_price"),
    prev_close: maybeNum(row, "prev_close"),
    forming,
    date: text(row, "date"),
    updatedAt: date(row, "updated_at"),
  };
}

function indexDoc(row: Row): IndexDoc {
  return {
    symbol: text(row, "symbol"),
    name: text(row, "name"),
    instrument_token: maybeNum(row, "instrument_token"),
    createdAt: date(row, "created_at"),
  };
}

function stockDoc(row: Row): StockDoc {
  return {
    instrument_token: num(row, "instrument_token"),
    tradingsymbol: text(row, "tradingsymbol"),
    name: text(row, "name"),
    addedAt: date(row, "added_at"),
  };
}

function member(row: Row): IndexMemberDoc {
  return {
    symbol: text(row, "symbol"),
    instrument_token: num(row, "instrument_token"),
    tradingsymbol: text(row, "tradingsymbol"),
    name: text(row, "name"),
  };
}

function pickDoc(row: Row): PickDoc {
  return {
    instrument_token: num(row, "instrument_token"),
    tradingsymbol: text(row, "tradingsymbol"),
    name: text(row, "name"),
    pickedAt: date(row, "picked_at"),
  };
}

function job(row: Row): StoredJob {
  const days = maybeNum(row, "days");
  const error = row.error == null ? undefined : String(row.error);
  return {
    _id: String(row.id),
    type: text(row, "type") === "instruments" ? "instruments" : "backfill",
    status: text(row, "status") as StoredJob["status"],
    days: days == null ? undefined : days,
    progress: JSON.parse(text(row, "progress")) as StoredJob["progress"],
    error,
    createdAt: date(row, "created_at"),
    updatedAt: date(row, "updated_at"),
  };
}

function deleteExcept(table: string, tokens: number[]): void {
  fillKeptTokens(tokens);
  if (tokens.length === 0) {
    getDb().exec(`DELETE FROM ${table}`);
    return;
  }
  getDb().exec(`DELETE FROM ${table} WHERE instrument_token NOT IN (SELECT token FROM kept_tokens)`);
}

export async function getSettings(): Promise<SettingsDoc> {
  await readyDb();
  const doc = one("SELECT * FROM settings WHERE id = ?", [SETTINGS_ID]);
  return {
    _id: SETTINGS_ID,
    minStrength: doc ? num(doc, "min_strength") : 3,
    backfillDays: doc ? num(doc, "backfill_days") : 30,
    pushoverMutedDate: doc?.pushover_muted_date == null ? null : String(doc.pushover_muted_date),
  };
}

export async function setPushoverMuted(muted: boolean): Promise<SettingsDoc> {
  await readyDb();
  const current = await getSettings();
  const mutedDate = muted ? istDateString(new Date()) : null;
  run(
    `INSERT INTO settings (id, min_strength, backfill_days, pushover_muted_date)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET pushover_muted_date = excluded.pushover_muted_date`,
    [SETTINGS_ID, current.minStrength, current.backfillDays, mutedDate],
  );
  return getSettings();
}

export async function saveSettings(input: {
  minStrength: number;
  backfillDays: number;
}): Promise<SettingsDoc> {
  await readyDb();
  const current = await getSettings();
  run(
    `INSERT INTO settings (id, min_strength, backfill_days, pushover_muted_date)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       min_strength = excluded.min_strength,
       backfill_days = excluded.backfill_days`,
    [SETTINGS_ID, input.minStrength, input.backfillDays, current.pushoverMutedDate],
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
  run(
    `INSERT INTO kite_sessions (access_token, user_id, user_name, login_time, login_date)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.accessToken,
      input.userId,
      input.userName,
      input.loginTime.toISOString(),
      istDateString(input.loginTime),
    ],
  );
}

export async function getKiteSession(date = istDateString(new Date())): Promise<KiteSessionDoc | null> {
  await readyDb();
  const row = one(
    "SELECT * FROM kite_sessions WHERE login_date = ? ORDER BY login_time DESC LIMIT 1",
    [date],
  );
  if (!row) return null;
  return {
    access_token: text(row, "access_token"),
    user_id: text(row, "user_id"),
    user_name: text(row, "user_name"),
    login_time: dateOf(row, "login_time"),
    login_date: text(row, "login_date"),
  };
}

function dateOf(row: Row, key: string): Date {
  return date(row, key);
}

export async function replaceInstruments(rows: InstrumentDoc[]): Promise<number> {
  if (rows.length === 0) throw new Error("Refusing to clear every instrument");
  await readyDb();
  const upsert = getDb().prepare(
    `INSERT INTO instruments (instrument_token, tradingsymbol, name, exchange, instrument_type, tick_size)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(instrument_token) DO UPDATE SET
       tradingsymbol = excluded.tradingsymbol,
       name = excluded.name,
       exchange = excluded.exchange,
       instrument_type = excluded.instrument_type,
       tick_size = excluded.tick_size`,
  );
  transaction(() => {
    for (const row of rows) {
      upsert.run(row.instrument_token, row.tradingsymbol, row.name, row.exchange, row.instrument_type, row.tick_size);
    }
    deleteExcept(
      "instruments",
      rows.map((row) => row.instrument_token),
    );
  });
  return rows.length;
}

export async function searchInstruments(query: string): Promise<InstrumentDoc[]> {
  await readyDb();
  const safe = query.trim();
  if (!safe) return [];
  return all(
    `SELECT * FROM instruments
     WHERE tradingsymbol LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
     ORDER BY tradingsymbol
     LIMIT 20`,
    [like(safe, "prefix"), like(safe, "contains")],
  ).map(instrument);
}

export async function upsertDailyBars(rows: DailyBarDoc[]): Promise<void> {
  if (rows.length === 0) return;
  await readyDb();
  const upsert = getDb().prepare(
    `INSERT INTO daily_bars (instrument_token, tradingsymbol, date, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(instrument_token, date) DO UPDATE SET
       tradingsymbol = excluded.tradingsymbol,
       open = excluded.open,
       high = excluded.high,
       low = excluded.low,
       close = excluded.close,
       volume = excluded.volume`,
  );
  transaction(() => {
    for (const row of rows) {
      upsert.run(row.instrument_token, row.tradingsymbol, row.date, row.open, row.high, row.low, row.close, row.volume);
    }
  });
}

export async function saveDayCandles(doc: CandleDoc): Promise<void> {
  await readyDb();
  run(
    `INSERT INTO candles_5m (instrument_token, tradingsymbol, date, candles)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(instrument_token, date) DO UPDATE SET
       tradingsymbol = excluded.tradingsymbol,
       candles = excluded.candles`,
    [doc.instrument_token, doc.tradingsymbol, doc.date, json(doc.candles)],
  );
}

export async function listDayCandles(tokens: number[], dateKey: string): Promise<Map<number, Candle[]>> {
  const map = new Map<number, Candle[]>();
  if (tokens.length === 0) return map;
  await readyDb();
  for (const slice of chunks(tokens)) {
    const rows = all(
      `SELECT instrument_token, candles FROM candles_5m WHERE date = ? AND instrument_token IN (${placeholders(slice.length)})`,
      [dateKey, ...slice],
    );
    for (const row of rows) map.set(num(row, "instrument_token"), JSON.parse(text(row, "candles")) as Candle[]);
  }
  return map;
}

export async function getDayCandles(token: number, dateKey: string): Promise<Candle[]> {
  await readyDb();
  const row = one("SELECT candles FROM candles_5m WHERE instrument_token = ? AND date = ?", [token, dateKey]);
  if (!row) return [];
  return JSON.parse(text(row, "candles")) as Candle[];
}

export async function getPreviousDaily(token: number, beforeDate: string): Promise<DailyBarDoc | null> {
  await readyDb();
  const row = one(
    `SELECT * FROM daily_bars
     WHERE instrument_token = ? AND date < ?
     ORDER BY date DESC
     LIMIT 1`,
    [token, beforeDate],
  );
  return row ? dailyBar(row) : null;
}

export async function listPreviousRanges(
  tokens: number[],
  beforeDate: string,
): Promise<Map<number, { high: number; low: number }>> {
  const map = new Map<number, { high: number; low: number }>();
  if (tokens.length === 0) return map;
  await readyDb();
  for (const slice of chunks(tokens)) {
    const rows = all(
      `SELECT d.instrument_token, d.high, d.low
       FROM daily_bars d
       INNER JOIN (
         SELECT instrument_token, MAX(date) AS date
         FROM daily_bars
         WHERE date < ? AND instrument_token IN (${placeholders(slice.length)})
         GROUP BY instrument_token
       ) latest ON latest.instrument_token = d.instrument_token AND latest.date = d.date`,
      [beforeDate, ...slice],
    );
    for (const row of rows) map.set(num(row, "instrument_token"), { high: num(row, "high"), low: num(row, "low") });
  }
  return map;
}

export async function listSessionLastCloses(tokens: number[], dateKey: string): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (tokens.length === 0) return map;
  await readyDb();
  for (const slice of chunks(tokens)) {
    const rows = all(
      `SELECT instrument_token, json_extract(candles, '$[#-1].close') AS close
       FROM candles_5m
       WHERE date = ? AND instrument_token IN (${placeholders(slice.length)})`,
      [dateKey, ...slice],
    );
    for (const row of rows) {
      const close = maybeNum(row, "close");
      if (close != null) map.set(num(row, "instrument_token"), close);
    }
  }
  return map;
}

export async function getPreviousSessionCandles(token: number, beforeDate: string): Promise<Candle[]> {
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
  const insert = getDb().prepare(
    `INSERT INTO coverage (instrument_token, interval, date) VALUES (?, ?, ?)
     ON CONFLICT(instrument_token, interval, date) DO NOTHING`,
  );
  transaction(() => {
    for (const day of dates) insert.run(token, interval, day);
  });
}

export async function missingCoverage(
  token: number,
  interval: CoverageDoc["interval"],
  dates: string[],
): Promise<string[]> {
  if (dates.length === 0) return [];
  await readyDb();
  const have = new Set<string>();
  for (const slice of chunks(dates)) {
    const rows = all(
      `SELECT date FROM coverage
       WHERE instrument_token = ? AND interval = ? AND date IN (${placeholders(slice.length)})`,
      [token, interval, ...slice],
    );
    for (const row of rows) have.add(text(row, "date"));
  }
  return dates.filter((day) => !have.has(day));
}

export async function upsertSignal(
  signalInput: Omit<SignalDoc, "notified" | "createdAt">,
): Promise<{ doc: SignalDoc; inserted: boolean }> {
  await readyDb();
  const createdAt = new Date().toISOString();
  const stored = transaction(() => {
    const existing = one(
      "SELECT 1 AS found FROM signals WHERE instrument_token = ? AND date = ? AND side = ?",
      [signalInput.instrument_token, signalInput.date, signalInput.side],
    );
    run(
      `INSERT INTO signals (
         instrument_token, tradingsymbol, date, side, time, ts, close, level, volume,
         strength, volume_score, wick_score, depth_score, relative_volume, notified, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(instrument_token, date, side) DO UPDATE SET
         tradingsymbol = excluded.tradingsymbol,
         time = excluded.time,
         ts = excluded.ts,
         close = excluded.close,
         level = excluded.level,
         volume = excluded.volume,
         strength = excluded.strength,
         volume_score = excluded.volume_score,
         wick_score = excluded.wick_score,
         depth_score = excluded.depth_score,
         relative_volume = excluded.relative_volume`,
      [
        signalInput.instrument_token,
        signalInput.tradingsymbol,
        signalInput.date,
        signalInput.side,
        signalInput.time,
        signalInput.ts,
        signalInput.close,
        signalInput.level,
        signalInput.volume,
        signalInput.strength,
        signalInput.volumeScore,
        signalInput.wickScore,
        signalInput.depthScore,
        signalInput.relativeVolume,
        createdAt,
      ],
    );
    const row = one("SELECT * FROM signals WHERE instrument_token = ? AND date = ? AND side = ?", [
      signalInput.instrument_token,
      signalInput.date,
      signalInput.side,
    ]);
    if (!row) throw new Error("Signal was not stored");
    return { doc: signal(row), inserted: !existing };
  });
  return stored;
}

export async function markSignalNotified(
  signalInput: Pick<SignalDoc, "instrument_token" | "date" | "side">,
): Promise<void> {
  await readyDb();
  run("UPDATE signals SET notified = 1 WHERE instrument_token = ? AND date = ? AND side = ?", [
    signalInput.instrument_token,
    signalInput.date,
    signalInput.side,
  ]);
}

export async function stockAlreadyNotified(token: number, dateKey: string): Promise<boolean> {
  await readyDb();
  return Boolean(
    one("SELECT 1 AS found FROM signals WHERE instrument_token = ? AND date = ? AND notified = 1", [token, dateKey]),
  );
}

export async function markStockNotified(token: number, dateKey: string): Promise<void> {
  await readyDb();
  run("UPDATE signals SET notified = 1 WHERE instrument_token = ? AND date = ?", [token, dateKey]);
}

export async function listSignals(dateKey: string): Promise<SignalDoc[]> {
  await readyDb();
  return all("SELECT * FROM signals WHERE date = ? ORDER BY time DESC", [dateKey]).map(signal);
}

export async function listSignalsForToken(token: number, dateKey: string): Promise<SignalDoc[]> {
  await readyDb();
  return all("SELECT * FROM signals WHERE instrument_token = ? AND date = ? ORDER BY time ASC", [
    token,
    dateKey,
  ]).map(signal);
}

export async function deleteAbsentSignals(
  token: number,
  dateKey: string,
  sides: Array<SignalDoc["side"]>,
): Promise<void> {
  await readyDb();
  if (sides.length === 0) {
    run("DELETE FROM signals WHERE instrument_token = ? AND date = ?", [token, dateKey]);
    return;
  }
  run(
    `DELETE FROM signals WHERE instrument_token = ? AND date = ? AND side NOT IN (${placeholders(sides.length)})`,
    [token, dateKey, ...sides],
  );
}

export async function requeueInterruptedJobs(): Promise<void> {
  await readyDb();
  run("UPDATE jobs SET status = 'queued', updated_at = ? WHERE status = 'running'", [new Date().toISOString()]);
}

export async function enqueueJob(type: JobType, days?: number): Promise<StoredJob> {
  await readyDb();
  const existing = one("SELECT * FROM jobs WHERE type = ? AND status IN ('queued', 'running') ORDER BY created_at ASC LIMIT 1", [
    type,
  ]);
  if (existing) return job(existing);
  const now = new Date().toISOString();
  const progress = json({ done: 0, total: 0, message: "Queued" });
  const inserted = run(
    `INSERT INTO jobs (type, status, days, progress, created_at, updated_at)
     VALUES (?, 'queued', ?, ?, ?, ?)`,
    [type, days ?? null, progress, now, now],
  );
  const row = one("SELECT * FROM jobs WHERE id = ?", [inserted.lastInsertRowid]);
  if (!row) throw new Error("Job was not stored");
  return job(row);
}

export async function latestJob(): Promise<StoredJob | null> {
  await readyDb();
  const row = one("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1");
  return row ? job(row) : null;
}

export async function claimJob(): Promise<StoredJob | null> {
  await readyDb();
  return transaction(() => {
    const queued = one("SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1");
    if (!queued) return null;
    const now = new Date().toISOString();
    const claimed = run("UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'", [
      now,
      num(queued, "id"),
    ]);
    if (claimed.changes === 0) return null;
    const row = one("SELECT * FROM jobs WHERE id = ?", [num(queued, "id")]);
    return row ? job(row) : null;
  });
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<JobDoc, "status" | "progress" | "error">>,
): Promise<void> {
  await readyDb();
  const sets: string[] = ["updated_at = ?"];
  const params: Sql[] = [new Date().toISOString()];
  if (patch.status) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (patch.progress) {
    sets.push("progress = ?");
    params.push(json(patch.progress));
  }
  if (patch.error !== undefined) {
    sets.push("error = ?");
    params.push(patch.error);
  }
  params.push(Number(id));
  run(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function writeRuntime(doc: Omit<RuntimeDoc, "_id" | "updatedAt">): Promise<void> {
  await readyDb();
  run(
    `INSERT INTO runtime (id, connected, last_tick_at, watch_count, message, updated_at)
     VALUES ('worker', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       connected = excluded.connected,
       last_tick_at = excluded.last_tick_at,
       watch_count = excluded.watch_count,
       message = excluded.message,
       updated_at = excluded.updated_at`,
    [doc.connected ? 1 : 0, doc.lastTickAt, doc.watchCount, doc.message, new Date().toISOString()],
  );
}

export async function readRuntime(): Promise<RuntimeDoc | null> {
  await readyDb();
  const row = one("SELECT * FROM runtime WHERE id = 'worker'");
  if (!row) return null;
  return {
    _id: "worker",
    connected: flag(row, "connected"),
    lastTickAt: maybeNum(row, "last_tick_at"),
    watchCount: num(row, "watch_count"),
    message: text(row, "message"),
    updatedAt: date(row, "updated_at"),
  };
}

export async function upsertQuotes(rows: QuoteDoc[]): Promise<void> {
  if (rows.length === 0) return;
  await readyDb();
  const upsert = getDb().prepare(
    `INSERT INTO quotes (instrument_token, tradingsymbol, last_price, prev_close, forming, date, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(instrument_token) DO UPDATE SET
       tradingsymbol = excluded.tradingsymbol,
       last_price = excluded.last_price,
       prev_close = COALESCE(excluded.prev_close, quotes.prev_close),
       forming = excluded.forming,
       date = excluded.date,
       updated_at = excluded.updated_at`,
  );
  transaction(() => {
    for (const row of rows) {
      const prev =
        row.prev_close != null && Number.isFinite(row.prev_close) && row.prev_close > 0 ? row.prev_close : null;
      upsert.run(
        row.instrument_token,
        row.tradingsymbol,
        row.last_price,
        prev,
        row.forming ? json(row.forming) : null,
        row.date,
        row.updatedAt.toISOString(),
      );
    }
  });
}

export async function listQuotes(tokens: number[]): Promise<QuoteDoc[]> {
  if (tokens.length === 0) return [];
  await readyDb();
  const rows: QuoteDoc[] = [];
  for (const slice of chunks(tokens)) {
    rows.push(
      ...all(`SELECT * FROM quotes WHERE instrument_token IN (${placeholders(slice.length)})`, slice).map(quote),
    );
  }
  return rows;
}

export async function claimNotice(id: string): Promise<boolean> {
  await readyDb();
  const result = run("INSERT INTO notices (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING", [
    id,
    new Date().toISOString(),
  ]);
  return result.changes === 1;
}

export async function clearNotice(id: string): Promise<void> {
  await readyDb();
  run("DELETE FROM notices WHERE id = ?", [id]);
}

export async function findInstrument(token: number): Promise<InstrumentDoc | null> {
  await readyDb();
  const row = one("SELECT * FROM instruments WHERE instrument_token = ?", [token]);
  return row ? instrument(row) : null;
}

export async function countInstruments(): Promise<number> {
  await readyDb();
  const row = one("SELECT COUNT(*) AS count FROM instruments");
  return row ? num(row, "count") : 0;
}

export async function listEquityInstruments(): Promise<InstrumentDoc[]> {
  await readyDb();
  return all("SELECT * FROM instruments WHERE instrument_type = 'EQ'").map(instrument);
}

export async function listIndexInstruments(): Promise<InstrumentDoc[]> {
  await readyDb();
  return all("SELECT * FROM instruments WHERE instrument_type = 'INDEX'").map(instrument);
}

export async function listFeedTargets(): Promise<WatchItem[]> {
  await readyDb();
  const stockRows = all("SELECT * FROM stocks").map(stockDoc);
  const indexRows = all("SELECT * FROM indices").map(indexDoc);
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
  const now = new Date().toISOString();
  return transaction(() => {
    const stockRows = new Map<number, IndexMembership["members"][number]>();
    let links = 0;
    const upsertIndex = getDb().prepare(
      `INSERT INTO indices (symbol, name, instrument_token, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(symbol) DO UPDATE SET
         name = excluded.name,
         instrument_token = COALESCE(excluded.instrument_token, indices.instrument_token)`,
    );
    const upsertMember = getDb().prepare(
      `INSERT INTO index_members (symbol, instrument_token, tradingsymbol, name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(symbol, instrument_token) DO UPDATE SET
         tradingsymbol = excluded.tradingsymbol,
         name = excluded.name`,
    );
    for (const book of books) {
      const symbol = normalizeIndexSymbol(book.symbol);
      if (!isIndexSymbol(symbol)) throw new Error(`Invalid index symbol ${book.symbol}`);
      const name = book.name.trim().replace(/\s+/g, " ").slice(0, 80) || symbol;
      if (book.members.length === 0) throw new Error(`Refusing to clear ${symbol}`);
      upsertIndex.run(symbol, name, book.instrument_token, now);
      for (const memberRow of book.members) {
        upsertMember.run(symbol, memberRow.instrument_token, memberRow.tradingsymbol, memberRow.name);
        stockRows.set(memberRow.instrument_token, memberRow);
      }
      fillKeptTokens(book.members.map((memberRow) => memberRow.instrument_token));
      run(
        "DELETE FROM index_members WHERE symbol = ? AND instrument_token NOT IN (SELECT token FROM kept_tokens)",
        [symbol],
      );
      links += book.members.length;
    }
    const rows = [...stockRows.values()];
    const keptSymbols = books.map((book) => normalizeIndexSymbol(book.symbol));
    const storedIndexes = all(
      `SELECT * FROM indices WHERE symbol IN (${placeholders(keptSymbols.length)})`,
      keptSymbols,
    ).map(indexDoc);
    const indexTokens = storedIndexes
      .map((row) => row.instrument_token)
      .filter((token): token is number => token != null);
    const keptTokens = [...new Set([...rows.map((row) => row.instrument_token), ...indexTokens])];
    fillKeptTokens(keptTokens);
    const symbolMarks = placeholders(keptSymbols.length);
    run(`DELETE FROM indices WHERE symbol NOT IN (${symbolMarks})`, keptSymbols);
    run(
      `DELETE FROM index_members WHERE symbol NOT IN (${symbolMarks}) OR instrument_token NOT IN (SELECT token FROM kept_tokens)`,
      keptSymbols,
    );
    deleteExcept("stocks", keptTokens);
    const upsertStock = getDb().prepare(
      `INSERT INTO stocks (instrument_token, tradingsymbol, name, added_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(instrument_token) DO UPDATE SET
         tradingsymbol = excluded.tradingsymbol,
         name = excluded.name`,
    );
    for (const row of rows) upsertStock.run(row.instrument_token, row.tradingsymbol, row.name, now);
    dropOutside(keptTokens);
    return { indices: books.length, stocks: rows.length, links };
  });
}

function dropOutside(tokens: number[]): void {
  for (const table of ["quotes", "candles_5m", "daily_bars", "signals", "coverage", "picks"]) {
    deleteExcept(table, tokens);
  }
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
  const rows = all("SELECT * FROM indices ORDER BY symbol ASC").map(indexDoc);
  const links = all("SELECT * FROM index_members").map(member);
  const bySymbol = new Map<string, number[]>();
  for (const link of links) {
    const list = bySymbol.get(link.symbol) ?? [];
    list.push(link.instrument_token);
    bySymbol.set(link.symbol, list);
  }
  const day = istDateString(new Date());
  const indexTokens = rows
    .map((row) => row.instrument_token)
    .filter((token): token is number => token != null);
  const [prices, moves] = await Promise.all([
    boardPrices(indexTokens, day),
    classifyTokens(
      links.map((link) => link.instrument_token),
      day,
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
  try {
    run("INSERT INTO indices (symbol, name, instrument_token, created_at) VALUES (?, ?, NULL, ?)", [
      symbol,
      name,
      new Date().toISOString(),
    ]);
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
  const result = run("UPDATE indices SET name = ? WHERE symbol = ?", [name, symbol]);
  if (result.changes === 0) throw new Error("Index not found");
  const rows = await listIndices();
  const row = rows.find((item) => item.symbol === symbol);
  if (!row) throw new Error("Index not found");
  return row;
}

export async function deleteIndex(symbolInput: string): Promise<void> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  transaction(() => {
    const existing = one("SELECT symbol FROM indices WHERE symbol = ?", [symbol]);
    if (!existing) throw new Error("Index not found");
    run("DELETE FROM indices WHERE symbol = ?", [symbol]);
    run("DELETE FROM index_members WHERE symbol = ?", [symbol]);
    run("DELETE FROM pie_picks WHERE symbol = ?", [symbol]);
  });
}

function groupEvents(signals: SignalDoc[]): Map<number, BreakEvent[]> {
  const map = new Map<number, BreakEvent[]>();
  for (const item of signals) {
    const list = map.get(item.instrument_token) ?? [];
    list.push({
      side: item.side,
      time: item.time,
      ts: item.ts,
      close: item.close,
      strength: item.strength,
    });
    map.set(item.instrument_token, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.ts - b.ts);
  return map;
}

export async function listStockBoard(dateKey: string): Promise<StockBoardRow[]> {
  const [rows, signals] = await Promise.all([listStocks(), listSignals(dateKey)]);
  const prices = await boardPrices(
    rows.map((row) => row.instrument_token),
    dateKey,
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
  return all("SELECT * FROM picks ORDER BY tradingsymbol ASC").map(pickDoc);
}

export async function addPick(token: number): Promise<PickDoc> {
  await readyDb();
  const stock = one("SELECT * FROM stocks WHERE instrument_token = ?", [token]);
  if (!stock) throw new Error("Stock is not in the book");
  const signals = await listSignalsForToken(token, istDateString(new Date()));
  if (signals.length === 0) throw new Error("That stock has not broken the previous high or low");
  const saved = stockDoc(stock);
  run(
    `INSERT INTO picks (instrument_token, tradingsymbol, name, picked_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(instrument_token) DO UPDATE SET
       tradingsymbol = excluded.tradingsymbol,
       name = excluded.name`,
    [token, saved.tradingsymbol, saved.name, new Date().toISOString()],
  );
  const row = one("SELECT * FROM picks WHERE instrument_token = ?", [token]);
  if (!row) throw new Error("Could not store the stock");
  return pickDoc(row);
}

export async function removePick(token: number): Promise<void> {
  await readyDb();
  run("DELETE FROM picks WHERE instrument_token = ?", [token]);
}

export async function clearPicks(): Promise<void> {
  await readyDb();
  transaction(() => {
    getDb().exec("DELETE FROM picks");
    getDb().exec("DELETE FROM pie_picks");
  });
}

export async function listPiePicks(): Promise<string[]> {
  await readyDb();
  return all("SELECT symbol FROM pie_picks ORDER BY added_at ASC").map((row) => text(row, "symbol"));
}

export async function addPiePick(symbolInput: string): Promise<string> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  const index = one("SELECT symbol FROM indices WHERE symbol = ?", [symbol]);
  if (!index) throw new Error("Index not found");
  run("INSERT INTO pie_picks (symbol, added_at) VALUES (?, ?) ON CONFLICT(symbol) DO NOTHING", [
    text(index, "symbol"),
    new Date().toISOString(),
  ]);
  return text(index, "symbol");
}

export async function removePiePick(symbolInput: string): Promise<void> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  run("DELETE FROM pie_picks WHERE symbol = ?", [symbol]);
}

export async function clearPiePicks(): Promise<void> {
  await readyDb();
  getDb().exec("DELETE FROM pie_picks");
}

export async function listBreakRows(dateKey: string): Promise<BreakPickRow[]> {
  const [board, picks] = await Promise.all([listStockBoard(dateKey), listPicks()]);
  const picked = new Set(picks.map((pick) => pick.instrument_token));
  return board
    .filter((row) => row.events.length > 0)
    .map((row) => ({ ...row, picked: picked.has(row.instrument_token) }))
    .sort((a, b) => latestEvent(b) - latestEvent(a) || a.tradingsymbol.localeCompare(b.tradingsymbol));
}

export async function listProbeRows(dateKey: string): Promise<BreakPickRow[]> {
  const [rows, picks] = await Promise.all([listStocks(), listPicks()]);
  const tokens = rows.map((row) => row.instrument_token);
  const [ranges, sessions, prices] = await Promise.all([
    listPreviousRanges(tokens, dateKey),
    listDayCandles(tokens, dateKey),
    boardPrices(tokens, dateKey),
  ]);
  const picked = new Set(picks.map((pick) => pick.instrument_token));
  return rows
    .map((row) => {
      const range = ranges.get(row.instrument_token);
      const probes = range
        ? detectProbes({ candles: sessions.get(row.instrument_token) ?? [], pdh: range.high, pdl: range.low })
        : [];
      const price = prices.get(row.instrument_token) ?? { last: null, prevClose: null };
      return {
        ...row,
        last: price.last,
        prevClose: price.prevClose,
        ...priceChange(price.last, price.prevClose),
        picked: picked.has(row.instrument_token),
        events: probes.map((probe) => ({
          side: probe.side,
          time: probe.time,
          ts: probe.ts,
          close: probe.close,
          strength: 0,
          probeTime: probe.probeTime,
        })),
      };
    })
    .filter((row) => row.events.length > 0)
    .sort((a, b) => latestEvent(b) - latestEvent(a) || a.tradingsymbol.localeCompare(b.tradingsymbol));
}

export async function listPickRows(dateKey: string): Promise<BreakPickRow[]> {
  const [picks, board] = await Promise.all([listPicks(), listStockBoard(dateKey)]);
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
  const rows = all("SELECT * FROM stocks ORDER BY tradingsymbol ASC").map(stockDoc);
  const links = all("SELECT * FROM index_members").map(member);
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
  const found = await findInstrument(token);
  if (!found) throw new Error("Instrument is not in the NSE equity list");
  run(
    `INSERT INTO stocks (instrument_token, tradingsymbol, name, added_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(instrument_token) DO NOTHING`,
    [found.instrument_token, found.tradingsymbol, found.name, new Date().toISOString()],
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
  const found = await findInstrument(nextToken);
  if (!found || found.instrument_type !== "EQ") throw new Error("Choose an NSE equity symbol");
  transaction(() => {
    const current = one("SELECT * FROM stocks WHERE instrument_token = ?", [token]);
    if (!current) throw new Error("Stock is not in the book");
    const clash = one("SELECT 1 AS found FROM stocks WHERE instrument_token = ?", [nextToken]);
    if (clash) throw new Error("That symbol is already in the book");
    run("INSERT INTO stocks (instrument_token, tradingsymbol, name, added_at) VALUES (?, ?, ?, ?)", [
      found.instrument_token,
      found.tradingsymbol,
      found.name,
      text(current, "added_at"),
    ]);
    run("DELETE FROM stocks WHERE instrument_token = ?", [token]);
    const links = all("SELECT * FROM index_members WHERE instrument_token = ?", [token]).map(member);
    if (links.length > 0) {
      run("DELETE FROM index_members WHERE instrument_token = ?", [token]);
      const upsert = getDb().prepare(
        `INSERT INTO index_members (symbol, instrument_token, tradingsymbol, name)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(symbol, instrument_token) DO UPDATE SET
           tradingsymbol = excluded.tradingsymbol,
           name = excluded.name`,
      );
      for (const link of links) upsert.run(link.symbol, nextToken, found.tradingsymbol, found.name);
    }
    const picked = one("SELECT * FROM picks WHERE instrument_token = ?", [token]);
    if (picked) {
      run("DELETE FROM picks WHERE instrument_token = ?", [token]);
      const alreadyPicked = one("SELECT 1 AS found FROM picks WHERE instrument_token = ?", [nextToken]);
      if (!alreadyPicked) {
        run("INSERT INTO picks (instrument_token, tradingsymbol, name, picked_at) VALUES (?, ?, ?, ?)", [
          nextToken,
          found.tradingsymbol,
          found.name,
          text(picked, "picked_at"),
        ]);
      }
    }
  });
  const rows = await listStocks();
  const row = rows.find((item) => item.instrument_token === nextToken);
  if (!row) throw new Error("Could not store the stock");
  return row;
}

export async function removeStock(token: number): Promise<void> {
  await readyDb();
  transaction(() => {
    const result = run("DELETE FROM stocks WHERE instrument_token = ?", [token]);
    run("DELETE FROM index_members WHERE instrument_token = ?", [token]);
    run("DELETE FROM picks WHERE instrument_token = ?", [token]);
    if (result.changes === 0) throw new Error("Stock is not in the book");
  });
}

export async function linkStock(symbolInput: string, token: number): Promise<void> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  const index = one("SELECT symbol FROM indices WHERE symbol = ?", [symbol]);
  if (!index) throw new Error("Create the index first");
  const stock = one("SELECT * FROM stocks WHERE instrument_token = ?", [token]);
  if (!stock) throw new Error("Add the stock first");
  const saved = stockDoc(stock);
  run(
    `INSERT INTO index_members (symbol, instrument_token, tradingsymbol, name)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(symbol, instrument_token) DO UPDATE SET
       tradingsymbol = excluded.tradingsymbol,
       name = excluded.name`,
    [symbol, token, saved.tradingsymbol, saved.name],
  );
}

export async function unlinkStock(symbolInput: string, token: number): Promise<void> {
  const symbol = normalizeIndexSymbol(symbolInput);
  await readyDb();
  run("DELETE FROM index_members WHERE symbol = ? AND instrument_token = ?", [symbol, token]);
}

async function boardPrices(
  tokens: number[],
  dateKey: string,
): Promise<Map<number, { last: number | null; prevClose: number | null }>> {
  const unique = [...new Set(tokens)];
  const map = new Map<number, { last: number | null; prevClose: number | null }>();
  if (unique.length === 0) return map;
  const live = dateKey === istDateString(new Date());
  const quotes = live ? await listQuotes(unique) : [];
  const quotePrev = new Map<number, number>();
  for (const item of quotes) {
    if (item.date === dateKey && item.prev_close != null && Number.isFinite(item.prev_close) && item.prev_close > 0) {
      quotePrev.set(item.instrument_token, item.prev_close);
    }
  }
  const [last, previous] = await Promise.all([lastPrices(unique, dateKey), previousCloses(unique, dateKey)]);
  for (const token of unique) {
    map.set(token, {
      last: last.get(token) ?? null,
      prevClose: quotePrev.get(token) ?? previous.get(token) ?? null,
    });
  }
  return map;
}

export async function sessionPrice(
  token: number,
  dateKey: string,
): Promise<{ last: number | null; prevClose: number | null; change: number | null; changePct: number | null }> {
  const prices = await boardPrices([token], dateKey);
  const price = prices.get(token) ?? { last: null, prevClose: null };
  return { last: price.last, prevClose: price.prevClose, ...priceChange(price.last, price.prevClose) };
}

async function previousCloses(tokens: number[], beforeDate: string): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (tokens.length === 0) return map;
  for (const slice of chunks(tokens)) {
    const rows = all(
      `SELECT d.instrument_token, d.close
       FROM daily_bars d
       INNER JOIN (
         SELECT instrument_token, MAX(date) AS date
         FROM daily_bars
         WHERE date < ? AND instrument_token IN (${placeholders(slice.length)})
         GROUP BY instrument_token
       ) latest ON latest.instrument_token = d.instrument_token AND latest.date = d.date`,
      [beforeDate, ...slice],
    );
    for (const row of rows) map.set(num(row, "instrument_token"), num(row, "close"));
  }
  return map;
}

async function lastPrices(tokens: number[], dateKey: string): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (tokens.length === 0) return map;
  if (dateKey === istDateString(new Date())) {
    const quotes = await listQuotes(tokens);
    for (const item of quotes) {
      if (item.date === dateKey && Number.isFinite(item.last_price)) map.set(item.instrument_token, item.last_price);
    }
  }
  const missing = tokens.filter((token) => !map.has(token));
  if (missing.length === 0) return map;
  for (const slice of chunks(missing)) {
    const rows = all(
      `SELECT instrument_token, close FROM daily_bars WHERE date = ? AND instrument_token IN (${placeholders(slice.length)})`,
      [dateKey, ...slice],
    );
    for (const row of rows) map.set(num(row, "instrument_token"), num(row, "close"));
  }
  return map;
}

async function classifyTokens(tokens: number[], dateKey: string): Promise<Map<number, Move>> {
  const unique = [...new Set(tokens)];
  const [previous, last] = await Promise.all([previousCloses(unique, dateKey), lastPrices(unique, dateKey)]);
  const map = new Map<number, Move>();
  for (const token of unique) map.set(token, classifyMove(last.get(token) ?? null, previous.get(token) ?? null));
  return map;
}

function sumMoves(tokens: number[], moves: Map<number, Move>) {
  return tally([...new Set(tokens)].map((token) => moves.get(token) ?? "unpriced"));
}

export async function dashboardBreadth(dateKey: string): Promise<DashboardBreadth> {
  await readyDb();
  const stockRows = all("SELECT * FROM stocks").map(stockDoc);
  const indexRows = all("SELECT * FROM indices").map(indexDoc);
  const nifty = pickIndex(indexRows, "nifty50");
  const bank = pickIndex(indexRows, "banknifty");
  const symbols = [nifty?.symbol, bank?.symbol].filter((symbol): symbol is string => Boolean(symbol));
  const memberRows =
    symbols.length === 0
      ? []
      : all(`SELECT * FROM index_members WHERE symbol IN (${placeholders(symbols.length)})`, symbols).map(member);
  const niftyTokens = memberRows.filter((row) => row.symbol === nifty?.symbol).map((row) => row.instrument_token);
  const bankTokens = memberRows.filter((row) => row.symbol === bank?.symbol).map((row) => row.instrument_token);
  const marketTokens = stockRows.map((row) => row.instrument_token);
  const quoteTokens = [nifty?.instrument_token, bank?.instrument_token].filter(
    (token): token is number => token != null,
  );
  const [moves, prices] = await Promise.all([
    classifyTokens([...marketTokens, ...niftyTokens, ...bankTokens], dateKey),
    boardPrices(quoteTokens, dateKey),
  ]);
  const empty = tally([]);
  const blank = { last: null, prevClose: null, change: null, changePct: null };
  const quoteIndex = (index: IndexDoc | null | undefined) => {
    const price = index?.instrument_token == null ? undefined : prices.get(index.instrument_token);
    const last = price?.last ?? null;
    const prevClose = price?.prevClose ?? null;
    return { last, prevClose, ...priceChange(last, prevClose) };
  };
  return {
    market: { label: "Market", symbol: null, missing: false, ...sumMoves(marketTokens, moves), ...blank },
    nifty50: nifty
      ? { label: nifty.name, symbol: nifty.symbol, missing: false, ...sumMoves(niftyTokens, moves), ...quoteIndex(nifty) }
      : { label: "Nifty 50", symbol: null, missing: true, ...empty, ...blank },
    banknifty: bank
      ? { label: bank.name, symbol: bank.symbol, missing: false, ...sumMoves(bankTokens, moves), ...quoteIndex(bank) }
      : { label: "Bank Nifty", symbol: null, missing: true, ...empty, ...blank },
  };
}

export async function indexCardsForInstrument(token: number, dateKey: string): Promise<IndexCard[]> {
  const breadths = await breadthForInstrument(token, dateKey);
  if (breadths.length === 0) return [];
  const symbols = breadths.map((row) => row.symbol).filter((symbol): symbol is string => Boolean(symbol));
  const docs = all(`SELECT * FROM indices WHERE symbol IN (${placeholders(symbols.length)})`, symbols).map(indexDoc);
  const bySymbol = new Map(docs.map((doc) => [doc.symbol, doc]));
  const tokens = docs.map((doc) => doc.instrument_token).filter((value): value is number => value != null);
  const prices = await boardPrices(tokens, dateKey);
  return breadths.map((breadth) => {
    const doc = breadth.symbol ? bySymbol.get(breadth.symbol) : undefined;
    const price = doc?.instrument_token != null ? prices.get(doc.instrument_token) : undefined;
    const last = price?.last ?? null;
    const prevClose = price?.prevClose ?? null;
    return { ...breadth, last, prevClose, ...priceChange(last, prevClose) };
  });
}

export async function breadthForInstrument(token: number, dateKey: string): Promise<Breadth[]> {
  await readyDb();
  const links = all("SELECT * FROM index_members WHERE instrument_token = ?", [token]).map(member);
  if (links.length === 0) return [];
  const symbols = [...new Set(links.map((link) => link.symbol))];
  const indexRows = all(`SELECT * FROM indices WHERE symbol IN (${placeholders(symbols.length)})`, symbols).map(indexDoc);
  const memberRows = all(`SELECT * FROM index_members WHERE symbol IN (${placeholders(symbols.length)})`, symbols).map(
    member,
  );
  const bySymbol = new Map<string, number[]>();
  for (const item of memberRows) {
    const list = bySymbol.get(item.symbol) ?? [];
    list.push(item.instrument_token);
    bySymbol.set(item.symbol, list);
  }
  const moves = await classifyTokens(
    memberRows.map((item) => item.instrument_token),
    dateKey,
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
