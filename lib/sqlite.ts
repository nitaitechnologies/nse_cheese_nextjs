import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SqlValue } from "node:sqlite";
import { envOptional } from "./env";

const globalForSqlite = globalThis as typeof globalThis & {
  sqlite?: DatabaseSync;
  deskPiesReady?: boolean;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  min_strength INTEGER NOT NULL,
  backfill_days INTEGER NOT NULL,
  pushover_muted_date TEXT
);
CREATE TABLE IF NOT EXISTS kite_sessions (
  id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  login_time TEXT NOT NULL,
  login_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS kite_sessions_login ON kite_sessions (login_date, login_time);
CREATE TABLE IF NOT EXISTS instruments (
  instrument_token INTEGER PRIMARY KEY,
  tradingsymbol TEXT NOT NULL,
  name TEXT NOT NULL,
  exchange TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  tick_size REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS instruments_symbol ON instruments (tradingsymbol);
CREATE TABLE IF NOT EXISTS daily_bars (
  instrument_token INTEGER NOT NULL,
  tradingsymbol TEXT NOT NULL,
  date TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  PRIMARY KEY (instrument_token, date)
);
CREATE TABLE IF NOT EXISTS candles_5m (
  instrument_token INTEGER NOT NULL,
  tradingsymbol TEXT NOT NULL,
  date TEXT NOT NULL,
  candles TEXT NOT NULL,
  PRIMARY KEY (instrument_token, date)
);
CREATE TABLE IF NOT EXISTS signals (
  instrument_token INTEGER NOT NULL,
  tradingsymbol TEXT NOT NULL,
  date TEXT NOT NULL,
  side TEXT NOT NULL,
  time TEXT NOT NULL,
  ts INTEGER NOT NULL,
  close REAL NOT NULL,
  level REAL NOT NULL,
  volume REAL NOT NULL,
  strength REAL NOT NULL,
  volume_score REAL NOT NULL,
  wick_score REAL NOT NULL,
  depth_score REAL NOT NULL,
  relative_volume REAL,
  notified INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (instrument_token, date, side)
);
CREATE INDEX IF NOT EXISTS signals_date ON signals (date);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  days INTEGER,
  progress TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status, created_at);
CREATE TABLE IF NOT EXISTS quotes (
  instrument_token INTEGER PRIMARY KEY,
  tradingsymbol TEXT NOT NULL,
  last_price REAL NOT NULL,
  prev_close REAL,
  forming TEXT,
  date TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runtime (
  id TEXT PRIMARY KEY,
  connected INTEGER NOT NULL,
  last_tick_at INTEGER,
  watch_count INTEGER NOT NULL,
  message TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coverage (
  instrument_token INTEGER NOT NULL,
  interval TEXT NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (instrument_token, interval, date)
);
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS indices (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instrument_token INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stocks (
  instrument_token INTEGER PRIMARY KEY,
  tradingsymbol TEXT NOT NULL,
  name TEXT NOT NULL,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS index_members (
  symbol TEXT NOT NULL,
  instrument_token INTEGER NOT NULL,
  tradingsymbol TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (symbol, instrument_token)
);
CREATE INDEX IF NOT EXISTS index_members_token ON index_members (instrument_token);
CREATE TABLE IF NOT EXISTS picks (
  instrument_token INTEGER PRIMARY KEY,
  tradingsymbol TEXT NOT NULL,
  name TEXT NOT NULL,
  picked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hides (
  instrument_token INTEGER NOT NULL,
  date TEXT NOT NULL,
  hidden_at TEXT NOT NULL,
  PRIMARY KEY (instrument_token, date)
);
CREATE INDEX IF NOT EXISTS hides_date ON hides (date);
CREATE TABLE IF NOT EXISTS pie_picks (
  symbol TEXT PRIMARY KEY,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS desk_pies (
  symbol TEXT PRIMARY KEY,
  added_at TEXT NOT NULL
);
`;

export function sqlitePath(): string {
  const configured = envOptional("SQLITE_PATH");
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), "data", "nse.sqlite");
}

export function getDb(): DatabaseSync {
  if (!globalForSqlite.sqlite) {
    const file = sqlitePath();
    mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA cache_size = -20000");
    db.exec(SCHEMA);
    db.exec("CREATE TEMP TABLE IF NOT EXISTS kept_tokens (token INTEGER PRIMARY KEY)");
    globalForSqlite.sqlite = db;
  }
  if (!globalForSqlite.deskPiesReady) {
    globalForSqlite.sqlite.exec(
      "CREATE TABLE IF NOT EXISTS desk_pies (symbol TEXT PRIMARY KEY, added_at TEXT NOT NULL)",
    );
    globalForSqlite.deskPiesReady = true;
  }
  return globalForSqlite.sqlite;
}

export function readyDb(): Promise<void> {
  getDb();
  return Promise.resolve();
}

export function closeDb(): void {
  globalForSqlite.sqlite?.close();
  globalForSqlite.sqlite = undefined;
  globalForSqlite.deskPiesReady = false;
}

let transactionDepth = 0;

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  const started = transactionDepth === 0;
  if (started) db.exec("BEGIN IMMEDIATE");
  transactionDepth += 1;
  try {
    const result = fn();
    transactionDepth -= 1;
    if (started) db.exec("COMMIT");
    return result;
  } catch (error) {
    transactionDepth -= 1;
    if (started) db.exec("ROLLBACK");
    throw error;
  }
}

export function fillKeptTokens(tokens: number[]): void {
  const db = getDb();
  db.exec("DELETE FROM kept_tokens");
  const insert = db.prepare("INSERT OR IGNORE INTO kept_tokens (token) VALUES (?)");
  for (const token of tokens) insert.run(token);
}

export type Row = Record<string, SqlValue>;

export function all(sql: string, params: SqlValue[] = []): Row[] {
  return getDb().prepare(sql).all(...params);
}

export function one(sql: string, params: SqlValue[] = []): Row | undefined {
  return getDb().prepare(sql).get(...params);
}

export function run(sql: string, params: SqlValue[] = []): { changes: number; lastInsertRowid: number } {
  const result = getDb().prepare(sql).run(...params);
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}

export function duplicateKey(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("errcode" in error)) return false;
  const code = Number((error as { errcode: unknown }).errcode);
  return (code & 0xff) === 19;
}
