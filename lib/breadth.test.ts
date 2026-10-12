import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { breadthSlot, classifyMove, pickIndex, priceChange, routeIndexSymbol, tally } from "./breadth";

describe("index symbols", () => {
  it("maps Nifty 50 and Bank Nifty names onto the dashboard pies", () => {
    assert.equal(breadthSlot("NIFTY 50"), "nifty50");
    assert.equal(breadthSlot("NIFTY50"), "nifty50");
    assert.equal(breadthSlot("NIFTY"), "nifty50");
    assert.equal(breadthSlot("NIFTY BANK"), "banknifty");
    assert.equal(breadthSlot("BANK NIFTY"), "banknifty");
    assert.equal(breadthSlot("BANKNIFTY"), "banknifty");
    assert.equal(breadthSlot("NIFTY IT"), null);
    assert.equal(routeIndexSymbol("NIFTY 50"), "NIFTY 50");
    assert.equal(routeIndexSymbol("NIFTY%2050"), "NIFTY 50");
    assert.equal(routeIndexSymbol("NIFTY%252050"), "NIFTY 50");
  });

  it("prefers the full Nifty 50 name when both exist", () => {
    const chosen = pickIndex(
      [
        { symbol: "NIFTY" },
        { symbol: "NIFTY 50" },
      ],
      "nifty50",
    );
    assert.equal(chosen?.symbol, "NIFTY 50");
  });
});

describe("price change", () => {
  it("measures the move from the previous close", () => {
    assert.deepEqual(priceChange(110, 100), { change: 10, changePct: 10 });
    assert.deepEqual(priceChange(90, 100), { change: -10, changePct: -10 });
    assert.deepEqual(priceChange(null, 100), { change: null, changePct: null });
    assert.deepEqual(priceChange(100, 0), { change: null, changePct: null });
  });
});

describe("advance decline", () => {
  it("compares the last price with the previous close", () => {
    assert.equal(classifyMove(101, 100), "advance");
    assert.equal(classifyMove(99, 100), "decline");
    assert.equal(classifyMove(100, 100), "unchanged");
    assert.equal(classifyMove(null, 100), "unpriced");
    assert.equal(classifyMove(100, null), "unpriced");
  });

  it("counts each stock once", () => {
    assert.deepEqual(tally(["advance", "advance", "decline", "unchanged", "unpriced"]), {
      advance: 2,
      decline: 1,
      unchanged: 1,
      unpriced: 1,
      total: 5,
    });
  });
});
