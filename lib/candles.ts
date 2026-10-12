import { bucketFromDate, istDateString, istTimestamp } from "./time";
import type { Candle, DailyBarDoc } from "./types";

export type RawBar = {
  date: Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function historicalToIntraday(rows: RawBar[]): Map<string, Candle[]> {
  const byDate = new Map<string, Candle[]>();
  for (const row of rows) {
    const bucket = bucketFromDate(asDate(row.date));
    if (!bucket) continue;
    const candle: Candle = {
      time: bucket.time,
      ts: istTimestamp(bucket.date, bucket.time),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    };
    const list = byDate.get(bucket.date) ?? [];
    list.push(candle);
    byDate.set(bucket.date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.ts - b.ts);
  }
  return byDate;
}

export function historicalToDaily(
  rows: RawBar[],
  instrumentToken: number,
  tradingsymbol: string,
): DailyBarDoc[] {
  return rows.map((row) => ({
    instrument_token: instrumentToken,
    tradingsymbol,
    date: istDateString(asDate(row.date)),
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
}

export function mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
  const map = new Map<string, Candle>();
  for (const candle of existing) map.set(candle.time, candle);
  for (const candle of incoming) map.set(candle.time, candle);
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}

export function mergePreferHistory(
  existing: Candle[],
  historical: Candle[],
  keepTime: string | null,
): Candle[] {
  const map = new Map<string, Candle>();
  for (const candle of existing) map.set(candle.time, candle);
  for (const candle of historical) {
    if (keepTime && candle.time === keepTime) continue;
    map.set(candle.time, candle);
  }
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}

export function distancePct(level: number | null, last: number | null, side: "high" | "low"): number | null {
  if (level == null || last == null || last === 0) return null;
  return side === "high" ? ((level - last) / last) * 100 : ((last - level) / last) * 100;
}
