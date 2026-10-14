export type Side = "PDH" | "PDL";

export type Candle = {
  time: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Score = {
  strength: number;
  volumeScore: number;
  wickScore: number;
  depthScore: number;
  relativeVolume: number | null;
};

export type Breakout = Score & {
  time: string;
  ts: number;
  side: Side;
  close: number;
  level: number;
  volume: number;
};

export type SignalDoc = Breakout & {
  instrument_token: number;
  tradingsymbol: string;
  date: string;
  notified: boolean;
  createdAt: Date;
};

export type DailyBarDoc = {
  instrument_token: number;
  tradingsymbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CandleDoc = {
  instrument_token: number;
  tradingsymbol: string;
  date: string;
  candles: Candle[];
};

export type InstrumentDoc = {
  instrument_token: number;
  tradingsymbol: string;
  name: string;
  exchange: "NSE";
  instrument_type: "EQ" | "INDEX";
  tick_size: number;
};

export type WatchItem = {
  instrument_token: number;
  tradingsymbol: string;
  name: string;
  addedAt: Date;
};

export type SettingsDoc = {
  _id: "app";
  minStrength: number;
  backfillDays: number;
  pushoverMutedDate: string | null;
};

export type JobType = "backfill" | "instruments";
export type JobStatus = "queued" | "running" | "done" | "error";

export type JobDoc = {
  type: JobType;
  status: JobStatus;
  days?: number;
  progress: { done: number; total: number; message: string };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type KiteSessionDoc = {
  access_token: string;
  user_id: string;
  user_name: string;
  login_time: Date;
  login_date: string;
};

export type QuoteDoc = {
  instrument_token: number;
  tradingsymbol: string;
  last_price: number;
  prev_close?: number | null;
  forming: Candle | null;
  date: string;
  updatedAt: Date;
};

export type RuntimeDoc = {
  _id: "worker";
  connected: boolean;
  lastTickAt: number | null;
  watchCount: number;
  message: string;
  updatedAt: Date;
};

export type CoverageDoc = {
  instrument_token: number;
  interval: "day" | "5minute";
  date: string;
};

export type IndexDoc = {
  symbol: string;
  name: string;
  instrument_token?: number | null;
  createdAt: Date;
};

export type StockDoc = {
  instrument_token: number;
  tradingsymbol: string;
  name: string;
  addedAt: Date;
};

export type IndexMemberDoc = {
  symbol: string;
  instrument_token: number;
  tradingsymbol: string;
  name: string;
};

export type IndexRow = {
  symbol: string;
  name: string;
  count: number;
  last: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  advance: number;
  decline: number;
  unchanged: number;
  unpriced: number;
};

export type BreakEvent = {
  kind: "break" | "probe";
  side: Side;
  time: string;
  ts: number;
  close: number;
  strength: number;
};

export type Probe = {
  side: Side;
  time: string;
  ts: number;
  close: number;
  level: number;
  probeTime: string;
  probeTs: number;
};

export type StockRow = {
  instrument_token: number;
  tradingsymbol: string;
  name: string;
  indices: string[];
};

export type StockBoardRow = StockRow & {
  last: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  picked: boolean;
  hidden: boolean;
  events: BreakEvent[];
};

export type DeskCounts = {
  breaks: number;
  probes: number;
  picks: number;
  stocks: number;
  indices: number;
};

export type PickDoc = {
  instrument_token: number;
  tradingsymbol: string;
  name: string;
  pickedAt: Date;
};

export type PiePickDoc = {
  symbol: string;
  addedAt: Date;
};

export type BreakPickRow = StockBoardRow;

export type IndexCard = Breadth & {
  last: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
};

export type Move = "advance" | "decline" | "unchanged" | "unpriced";

export type Breadth = {
  label: string;
  symbol: string | null;
  advance: number;
  decline: number;
  unchanged: number;
  unpriced: number;
  total: number;
  missing: boolean;
};

export type DashboardBreadth = {
  market: IndexCard;
  nifty50: IndexCard;
  banknifty: IndexCard;
  extras: IndexCard[];
};

export type PieFrame = {
  time: string;
  advance: number;
  decline: number;
  unchanged: number;
  unpriced: number;
  total: number;
  last: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
};

export type PieReplay = {
  label: string;
  symbol: string | null;
  frames: PieFrame[];
};

export type WatchRow = {
  instrument_token: number;
  tradingsymbol: string;
  name: string;
  last: number | null;
  pdh: number | null;
  pdl: number | null;
  distHighPct: number | null;
  distLowPct: number | null;
  signal: SignalDoc | null;
};

export type DashboardPayload = {
  date: string;
  kite: {
    connected: boolean;
    userId: string | null;
    userName: string | null;
    loginDate: string | null;
  };
  worker: {
    connected: boolean;
    lastTickAt: number | null;
    watchCount: number;
    message: string;
  };
  breakouts: SignalDoc[];
  watching: WatchRow[];
  breadth: DashboardBreadth;
};
