import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPieFrames } from "./pie-history";
import { istTimestamp } from "./time";
import type { Candle } from "./types";

function candle(time: string, close: number): Candle {
  return { time, ts: istTimestamp("2026-10-14", time), open: close, high: close, low: close, close, volume: 1 };
}

describe("pie replay frames", () => {
  it("carries the last print forward and classifies each 5-minute mark", () => {
    const frames = buildPieFrames({
      times: ["09:15", "09:20", "09:25"],
      track: { label: "Nifty 50", symbol: "NIFTY 50", tokens: [1, 2], quoteToken: 9 },
      previous: new Map([
        [1, 100],
        [2, 50],
        [9, 1000],
      ]),
      candles: new Map([
        [1, [candle("09:15", 110), candle("09:25", 90)]],
        [2, [candle("09:20", 50)]],
        [9, [candle("09:15", 1010), candle("09:20", 1000)]],
      ]),
      live: { time: "09:25", prices: new Map([[1, 80], [9, 990]]) },
    });
    assert.equal(frames[0]?.advance, 1);
    assert.equal(frames[0]?.unpriced, 1);
    assert.equal(frames[0]?.last, 1010);
    assert.equal(frames[1]?.advance, 1);
    assert.equal(frames[1]?.unchanged, 1);
    assert.equal(frames[1]?.last, 1000);
    assert.equal(frames[1]?.change, 0);
    assert.equal(frames[2]?.decline, 1);
    assert.equal(frames[2]?.unchanged, 1);
    assert.equal(frames[2]?.last, 990);
    assert.equal(frames[2]?.change, -10);
  });
});
