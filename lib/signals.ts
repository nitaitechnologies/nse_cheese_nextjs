import type { Breakout, Candle, Score, Side } from "./types";

export type EventFilter = "all" | "break" | "PDH" | "PDL" | "none";

export function eventVisible(events: Array<{ side: Side }>, filter: EventFilter): boolean {
  if (filter === "all") return true;
  if (filter === "none") return events.length === 0;
  if (filter === "break") return events.length > 0;
  return events.some((event) => event.side === filter);
}

export function volumeScore(relative: number | null): number {
  if (relative == null || !Number.isFinite(relative)) return 1;
  if (relative < 0.8) return 1;
  if (relative < 1.2) return 2;
  if (relative < 1.8) return 3;
  if (relative <= 2.5) return 4;
  return 5;
}

export function wickScore(candle: Candle, side: Side): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 1;
  const closeLocation =
    side === "PDH"
      ? (candle.close - candle.low) / range
      : (candle.high - candle.close) / range;
  const wick =
    side === "PDH"
      ? (candle.high - Math.max(candle.open, candle.close)) / range
      : (Math.min(candle.open, candle.close) - candle.low) / range;
  if (closeLocation >= 0.85 && wick <= 0.15) return 5;
  if (closeLocation >= 0.7 && wick <= 0.25) return 4;
  if (closeLocation >= 0.55 && wick <= 0.35) return 3;
  if (closeLocation >= 0.4) return 2;
  return 1;
}

export function depthPercent(close: number, level: number, side: Side): number {
  if (!level) return 0;
  return side === "PDH"
    ? ((close - level) / level) * 100
    : ((level - close) / level) * 100;
}

export function depthScore(close: number, level: number, side: Side): number {
  const depth = depthPercent(close, level, side);
  if (depth < 0.05) return 1;
  if (depth < 0.15) return 2;
  if (depth < 0.35) return 4;
  if (depth <= 0.7) return 5;
  if (depth <= 1.2) return 3;
  return 2;
}

export function combineStrength(
  volume: number,
  wick: number,
  depth: number,
): number {
  const raw = 0.4 * volume + 0.35 * wick + 0.25 * depth;
  return Math.min(5, Math.max(1, Math.round(raw)));
}

function averageVolume(candles: Candle[]): number | null {
  if (candles.length === 0) return null;
  const sum = candles.reduce((total, candle) => total + candle.volume, 0);
  if (sum <= 0) return null;
  return sum / candles.length;
}

export function scoreCandle(
  candle: Candle,
  side: Side,
  level: number,
  lookback: Candle[],
): Score {
  const avg = averageVolume(lookback);
  const relativeVolume = avg && avg > 0 ? candle.volume / avg : null;
  const volume = volumeScore(relativeVolume);
  const wick = wickScore(candle, side);
  const depth = depthScore(candle.close, level, side);
  return {
    strength: combineStrength(volume, wick, depth),
    volumeScore: volume,
    wickScore: wick,
    depthScore: depth,
    relativeVolume,
  };
}

export function detectBreaks(input: {
  candles: Candle[];
  priorCandles: Candle[];
  pdh: number;
  pdl: number;
}): Breakout[] {
  const breaks: Breakout[] = [];
  let brokeHigh = false;
  let brokeLow = false;
  const ordered = [...input.candles].sort((a, b) => a.ts - b.ts);

  ordered.forEach((candle, index) => {
    const history = [...input.priorCandles, ...ordered.slice(0, index)].slice(-20);
    if (!brokeHigh && input.pdh > 0 && candle.close > input.pdh) {
      brokeHigh = true;
      breaks.push({
        ...scoreCandle(candle, "PDH", input.pdh, history),
        time: candle.time,
        ts: candle.ts,
        side: "PDH",
        close: candle.close,
        level: input.pdh,
        volume: candle.volume,
      });
    }
    if (!brokeLow && input.pdl > 0 && candle.close < input.pdl) {
      brokeLow = true;
      breaks.push({
        ...scoreCandle(candle, "PDL", input.pdl, history),
        time: candle.time,
        ts: candle.ts,
        side: "PDL",
        close: candle.close,
        level: input.pdl,
        volume: candle.volume,
      });
    }
  });

  return breaks;
}
