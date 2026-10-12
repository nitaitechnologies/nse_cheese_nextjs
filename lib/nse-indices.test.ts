import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIndexBook } from "./nse-indices";

describe("NSE index constituents", () => {
  it("keeps the short symbol and drops the index row", () => {
    const book = parseIndexBook("NIFTY HEALTHCARE", {
      data: {
        data: [
          { symbol: "NIFTY HEALTHCARE INDEX", identifier: "NIFTY HEALTHCARE INDEX", series: null },
          { symbol: "ABBOTINDIA", series: "EQ", companyName: "ABBOTT INDIA LIMITED" },
          { symbol: "ABBOTINDIA", series: "EQ", companyName: "ABBOTT INDIA LIMITED" },
          { symbol: "LUPIN", series: "EQ", companyName: "LUPIN LIMITED" },
        ],
      },
    });
    assert.equal(book.symbol, "NIFTY HEALTHCARE");
    assert.equal(book.name, "NIFTY HEALTHCARE");
    assert.deepEqual(book.stocks, [
      { tradingsymbol: "ABBOTINDIA", name: "ABBOTT INDIA LIMITED" },
      { tradingsymbol: "LUPIN", name: "LUPIN LIMITED" },
    ]);
  });

  it("rejects a payload that has no stocks", () => {
    assert.throws(
      () =>
        parseIndexBook("NIFTY 50", {
          data: {
            data: [
              { symbol: "NIFTY 50", series: null },
              { symbol: "NIFTY 50", series: null },
            ],
          },
        }),
      /no stocks/,
    );
  });
});
