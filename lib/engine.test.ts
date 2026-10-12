import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectBreaks, eventVisible } from "./signals";
import {
  addCalendarDays,
  bucketFromDate,
  istTimestamp,
  weekdayDates,
} from "./time";
import type { Candle } from "./types";

function candle(
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  date = "2026-10-12",
): Candle {
  return {
    time,
    ts: istTimestamp(date, time),
    open,
    high,
    low,
    close,
    volume,
  };
}

describe("IST session clock", () => {
  it("anchors 5-minute buckets to 09:15 IST", () => {
    assert.equal(new Date(istTimestamp("2026-10-12", "09:15") * 1000).toISOString(), "2026-10-12T03:45:00.000Z");
    assert.equal(bucketFromDate(new Date(istTimestamp("2026-10-12", "09:14") * 1000)), null);
    assert.deepEqual(bucketFromDate(new Date(istTimestamp("2026-10-12", "09:15") * 1000)), {
      date: "2026-10-12",
      time: "09:15",
    });
    assert.equal(bucketFromDate(new Date(istTimestamp("2026-10-12", "09:19") * 1000))?.time, "09:15");
    assert.equal(bucketFromDate(new Date(istTimestamp("2026-10-12", "09:20") * 1000))?.time, "09:20");
    assert.equal(bucketFromDate(new Date(istTimestamp("2026-10-12", "15:29") * 1000))?.time, "15:25");
    assert.equal(bucketFromDate(new Date(istTimestamp("2026-10-12", "15:30") * 1000)), null);
  });

  it("lists weekdays and steps across months", () => {
    assert.equal(addCalendarDays("2026-10-30", 2), "2026-11-01");
    assert.deepEqual(weekdayDates("2026-10-10", "2026-10-12"), ["2026-10-12"]);
  });
});

describe("previous-day break scoring", () => {
  const prior: Candle[] = [];
  for (let index = 0; index < 20; index += 1) {
    const bar = candle("10:15", 100, 101, 99, 100, 100, "2026-10-09");
    prior.push({ ...bar, ts: bar.ts + index });
  }

  it("ignores a wick through the high until the close clears it", () => {
    const breaks = detectBreaks({
      pdh: 100,
      pdl: 90,
      priorCandles: prior,
      candles: [
        candle("09:15", 99, 101.2, 98.8, 99.6, 100),
        candle("09:20", 100.1, 100.5, 100.05, 100.48, 300),
      ],
    });
    assert.equal(breaks.length, 1);
    assert.equal(breaks[0]?.side, "PDH");
    assert.equal(breaks[0]?.time, "09:20");
    assert.equal(breaks[0]?.strength, 5);
    assert.equal(breaks[0]?.volumeScore, 5);
    assert.equal(breaks[0]?.wickScore, 5);
    assert.equal(breaks[0]?.depthScore, 5);
  });

  it("counts a gap open and only the first close", () => {
    const breaks = detectBreaks({
      pdh: 100,
      pdl: 90,
      priorCandles: prior,
      candles: [
        candle("09:15", 101, 102, 100.8, 101.6, 400),
        candle("09:20", 101.6, 103, 101.4, 102.5, 400),
      ],
    });
    assert.equal(breaks.length, 1);
    assert.equal(breaks[0]?.time, "09:15");
  });

  it("scores a shallow, wick-heavy low break as weak", () => {
    const breaks = detectBreaks({
      pdh: 110,
      pdl: 100,
      priorCandles: prior,
      candles: [candle("09:15", 100.2, 100.4, 99.2, 99.98, 40)],
    });
    assert.equal(breaks.length, 1);
    assert.equal(breaks[0]?.side, "PDL");
    assert.equal(breaks[0]?.volumeScore, 1);
    assert.equal(breaks[0]?.depthScore, 1);
    assert.ok((breaks[0]?.strength ?? 5) <= 2);
  });
});

describe("event filter", () => {
  const high = [{ side: "PDH" as const }];
  const both = [{ side: "PDH" as const }, { side: "PDL" as const }];

  it("keeps rows that match the selected break", () => {
    assert.equal(eventVisible(high, "all"), true);
    assert.equal(eventVisible(high, "break"), true);
    assert.equal(eventVisible(high, "PDH"), true);
    assert.equal(eventVisible(high, "PDL"), false);
    assert.equal(eventVisible([], "none"), true);
    assert.equal(eventVisible(both, "none"), false);
    assert.equal(eventVisible(both, "PDL"), true);
  });
});
