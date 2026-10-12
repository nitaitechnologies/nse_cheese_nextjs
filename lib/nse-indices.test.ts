import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseConstituentCsv } from "./nse-indices";

const SAMPLE = `Company Name,Industry,Symbol,Series,ISIN Code
Abbott India Ltd.,Healthcare,ABBOTINDIA,EQ,INE358A01014
Abbott India Ltd.,Healthcare,ABBOTINDIA,EQ,INE358A01014
Lupin Ltd.,Healthcare,LUPIN,EQ,INE326A01037
`;

describe("NSE index constituents", () => {
  it("reads symbols from the constituent file and drops duplicates", () => {
    const book = parseConstituentCsv("NIFTY HEALTHCARE", SAMPLE);
    assert.equal(book.symbol, "NIFTY HEALTHCARE");
    assert.equal(book.name, "NIFTY HEALTHCARE");
    assert.deepEqual(book.stocks, [
      { tradingsymbol: "ABBOTINDIA", name: "Abbott India Ltd." },
      { tradingsymbol: "LUPIN", name: "Lupin Ltd." },
    ]);
  });

  it("rejects a file that has no stocks", () => {
    assert.throws(
      () => parseConstituentCsv("NIFTY 50", "Company Name,Industry,Symbol,Series,ISIN Code\n"),
      /no constituents/,
    );
  });
});
