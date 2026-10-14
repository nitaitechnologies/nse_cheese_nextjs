import { classifyMove, priceChange, tally } from "./breadth";
import type { Candle, PieFrame } from "./types";

export type PieTrack = {
  label: string;
  symbol: string | null;
  tokens: number[];
  quoteToken: number | null;
};

export type PieLive = {
  time: string;
  prices: Map<number, number>;
};

function priceAt(token: number, time: string, candles: Map<number, Candle[]>, live: PieLive | null): number | null {
  if (live && live.time === time) {
    const quote = live.prices.get(token);
    if (quote != null && Number.isFinite(quote)) return quote;
  }
  const rows = candles.get(token);
  if (!rows) return null;
  let close: number | null = null;
  for (const candle of rows) {
    if (candle.time > time) break;
    close = candle.close;
  }
  return close;
}

export function buildPieFrames(input: {
  times: string[];
  track: PieTrack;
  previous: Map<number, number>;
  candles: Map<number, Candle[]>;
  live: PieLive | null;
}): PieFrame[] {
  const tokens = [...new Set(input.track.tokens)];
  const ordered = new Map<number, Candle[]>();
  const needed = new Set(tokens);
  if (input.track.quoteToken != null) needed.add(input.track.quoteToken);
  for (const token of needed) {
    const rows = input.candles.get(token);
    if (!rows) continue;
    ordered.set(
      token,
      [...rows].sort((a, b) => a.time.localeCompare(b.time)),
    );
  }
  return input.times.map((time) => {
    const counts = tally(
      tokens.map((token) => classifyMove(priceAt(token, time, ordered, input.live), input.previous.get(token) ?? null)),
    );
    const quote = input.track.quoteToken;
    const last = quote == null ? null : priceAt(quote, time, ordered, input.live);
    const prevClose = quote == null ? null : (input.previous.get(quote) ?? null);
    return {
      time,
      ...counts,
      last,
      prevClose,
      ...priceChange(last, prevClose),
    };
  });
}
