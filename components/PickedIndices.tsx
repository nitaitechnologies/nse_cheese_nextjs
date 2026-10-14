"use client";

import { useEffect, useState } from "react";
import { api, dated } from "./api";
import { useSessionDate } from "./SessionDate";
import CopySymbol from "./CopySymbol";
import { money, signed, signedPct, tone } from "./format";
import BreadthPie from "./Pie";
import type { BreakPickRow, IndexCard, IndexRow } from "@/lib/types";

function breadthOf(index: IndexRow): IndexCard {
  return {
    label: index.name,
    symbol: index.symbol,
    advance: index.advance,
    decline: index.decline,
    unchanged: index.unchanged,
    unpriced: index.unpriced,
    total: index.count,
    missing: false,
    last: index.last,
    prevClose: index.prevClose,
    change: index.change,
    changePct: index.changePct,
  };
}

export default function PickedIndices() {
  const [stocks, setStocks] = useState<BreakPickRow[]>([]);
  const [indices, setIndices] = useState<IndexRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const { date, ready } = useSessionDate();

  useEffect(() => {
    if (!ready) return;
    let gone = false;
    async function refresh() {
      try {
        const [picks, book] = await Promise.all([
          api<{ stocks: BreakPickRow[] }>(dated("/api/picks", date)),
          api<{ indices: IndexRow[] }>(dated("/api/indices", date)),
        ]);
        if (gone) return;
        setStocks(picks.stocks);
        setIndices(book.indices);
        setError("");
        setLoaded(true);
      } catch (err) {
        if (gone) return;
        setError(err instanceof Error ? err.message : "Could not load picked indices");
        setLoaded(true);
      }
    }
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    const poll = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      gone = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [date, ready]);

  const symbols = [...new Set(stocks.flatMap((stock) => stock.indices))].sort((a, b) => a.localeCompare(b));
  const unlinked = stocks
    .filter((stock) => stock.indices.length === 0)
    .sort((a, b) => a.tradingsymbol.localeCompare(b.tradingsymbol));

  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-muted">Indices of picked stocks</h2>
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      {!loaded ? (
        <p className="mt-3 text-sm text-muted">Loading picked indices…</p>
      ) : stocks.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
          No stocks picked yet. Check them on Breaks.
        </p>
      ) : symbols.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Picked stocks are not linked to an index.</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {symbols.map((symbol) => {
            const index = indices.find((item) => item.symbol === symbol);
            const members = stocks
              .filter((stock) => stock.indices.includes(symbol))
              .sort((a, b) => a.tradingsymbol.localeCompare(b.tradingsymbol));
            return (
              <article key={symbol} className="flex flex-col rounded-2xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-medium">{symbol}</p>
                  <CopySymbol value={symbol} />
                </div>
                <div className="mt-2 [&_article]:w-full [&_article]:flex-none">
                  {index ? (
                    <BreadthPie breadth={breadthOf(index)} />
                  ) : (
                    <p className="rounded-2xl border border-line px-4 py-6 text-sm text-muted">
                      {symbol} is not in the book.
                    </p>
                  )}
                </div>
                <h3 className="mt-3 text-xs font-medium text-muted">Stocks</h3>
                <ul className="mt-1">
                  {members.map((stock) => (
                    <li
                      key={stock.instrument_token}
                      className="flex items-start justify-between gap-2 border-t border-line py-2"
                    >
                      <div className="min-w-0">
                        <p className="break-all font-medium">{stock.tradingsymbol}</p>
                        <p className="break-words text-xs text-muted">{stock.name}</p>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <div className="text-right">
                          <p className={`font-mono text-sm ${tone(stock.change)}`}>{money(stock.last)}</p>
                          <p className={`font-mono text-xs ${tone(stock.change)}`}>
                            {signed(stock.change)} · {signedPct(stock.changePct)}
                          </p>
                        </div>
                        <CopySymbol value={stock.tradingsymbol} />
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
      {loaded && unlinked.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-medium text-muted">Picked stocks with no index</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {unlinked.map((stock) => (
              <li key={stock.instrument_token} className="flex items-center justify-between gap-2">
                <p className="min-w-0 break-all text-sm">{stock.tradingsymbol}</p>
                <CopySymbol value={stock.tradingsymbol} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
