"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./api";
import { money, signed, signedPct, tone } from "./format";
import BreadthPie from "./Pie";
import StockCard from "./StockCard";
import { routeIndexSymbol } from "@/lib/breadth";
import type { IndexCard, IndexRow, StockBoardRow } from "@/lib/types";

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

export default function IndexView({ symbol }: { symbol: string }) {
  const key = routeIndexSymbol(symbol);
  const [index, setIndex] = useState<IndexRow | null>(null);
  const [stocks, setStocks] = useState<StockBoardRow[]>([]);
  const [filterText, setFilterText] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const [indexBody, stockBody] = await Promise.all([
      api<{ indices: IndexRow[] }>("/api/indices"),
      api<{ stocks: StockBoardRow[] }>("/api/stocks"),
    ]);
    setIndex(indexBody.indices.find((item) => item.symbol === key) ?? null);
    setStocks(stockBody.stocks.filter((stock) => stock.indices.includes(key)));
    setLoaded(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load the index"));
    }, 0);
    const poll = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [key]);

  async function remove(token: number) {
    setError("");
    try {
      await api("/api/stocks", {
        method: "DELETE",
        body: JSON.stringify({ instrument_token: token }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the stock");
    }
  }

  const needle = filterText.trim().toLowerCase();
  const visible = stocks.filter((stock) => {
    if (!needle) return true;
    return stock.tradingsymbol.toLowerCase().includes(needle) || stock.name.toLowerCase().includes(needle);
  });

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <div className="flex items-center justify-between gap-3">
        <Link href="/indices" className="inline-flex min-h-11 items-center text-gold">
          Back
        </Link>
        {index ? (
          <Link href={`/indices/${encodeURIComponent(index.symbol)}/edit`} className="inline-flex min-h-11 items-center text-gold">
            Edit
          </Link>
        ) : null}
      </div>
      <h1 className="mt-2 text-2xl font-semibold">{index?.symbol ?? key}</h1>
      <p className="mt-1 text-sm text-muted">{index ? index.name : "Index"}</p>
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      {!loaded ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : !index ? (
        <p className="mt-4 text-sm text-down">This index is not in the book.</p>
      ) : (
        <>
          <div className="mt-4">
            <p className={`font-mono text-2xl ${tone(index.change)}`}>{money(index.last)}</p>
            <p className={`font-mono text-sm ${tone(index.change)}`}>
              {signed(index.change)} · {signedPct(index.changePct)}
            </p>
            <p className="mt-1 font-mono text-xs text-muted">Prev close {money(index.prevClose)}</p>
          </div>
          <div className="mt-4 max-w-xs">
            <BreadthPie breadth={breadthOf(index)} />
          </div>
          <h2 className="mt-6 text-sm font-medium text-muted">Stocks in {index.symbol}</h2>
          <input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Filter symbol or name"
            className="mt-3 min-h-12 w-full rounded-xl border border-line bg-panel px-3 outline-none"
          />
          <div className="mt-4 flex flex-col gap-2">
            {stocks.length === 0 ? (
              <p className="text-sm text-muted">Nothing linked yet.</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-muted">No stocks match this filter.</p>
            ) : (
              visible.map((stock) => (
                <StockCard key={stock.instrument_token} stock={stock} onRemove={(token) => void remove(token)} />
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
