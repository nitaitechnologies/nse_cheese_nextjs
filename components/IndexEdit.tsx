"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./api";
import { routeIndexSymbol } from "@/lib/breadth";
import type { IndexRow, StockRow } from "@/lib/types";

export default function IndexEdit({ symbol }: { symbol: string }) {
  const key = routeIndexSymbol(symbol);
  const [index, setIndex] = useState<IndexRow | null>(null);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const [indexBody, stockBody] = await Promise.all([
      api<{ indices: IndexRow[] }>("/api/indices"),
      api<{ stocks: StockRow[] }>("/api/stocks"),
    ]);
    const row = indexBody.indices.find((item) => item.symbol === key) ?? null;
    setIndex(row);
    setStocks(stockBody.stocks);
    setLoaded(true);
    return row;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
        .then((row) => {
          if (row) setName(row.name);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Could not load the index"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);

  async function saveName() {
    if (!index) return;
    setError("");
    try {
      const body = await api<{ index: IndexRow }>("/api/indices", {
        method: "PATCH",
        body: JSON.stringify({ symbol: index.symbol, name }),
      });
      setIndex(body.index);
      setName(body.index.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename the index");
    }
  }

  async function link(token: number, on: boolean) {
    if (!index) return;
    setError("");
    try {
      await api("/api/links", {
        method: on ? "DELETE" : "POST",
        body: JSON.stringify({ symbol: index.symbol, instrument_token: token }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the link");
    }
  }

  const needle = query.trim().toLowerCase();
  const members = stocks.filter((stock) => stock.indices.includes(key));
  const available = stocks.filter((stock) => {
    if (stock.indices.includes(key)) return false;
    if (!needle) return true;
    return stock.tradingsymbol.toLowerCase().includes(needle) || stock.name.toLowerCase().includes(needle);
  });

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <Link href={index ? `/indices/${encodeURIComponent(index.symbol)}` : "/indices"} className="inline-flex min-h-11 items-center text-gold">
        Back
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{index?.symbol ?? key}</h1>
      <p className="mt-1 text-sm text-muted">Change the name and the stocks in this index.</p>
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      {!loaded ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : !index ? (
        <p className="mt-4 text-sm text-down">This index is not in the book.</p>
      ) : (
        <>
          <h2 className="mt-6 text-sm font-medium text-muted">Name</h2>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-12 flex-1 rounded-xl border border-line bg-panel px-3 outline-none"
            />
            <button className="min-h-12 rounded-xl bg-gold px-4 font-semibold text-ink" onClick={() => void saveName()}>
              Save name
            </button>
          </div>
          <h2 className="mt-6 text-sm font-medium text-muted">Add a stock</h2>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a stock already in the book"
            className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3 outline-none"
          />
          <div className="mt-2 flex flex-col gap-2">
            {stocks.length === 0 ? (
              <p className="text-sm text-muted">Add stocks on the Stocks page, then link them here.</p>
            ) : available.length === 0 ? (
              <p className="text-sm text-muted">Every matching stock is already in this index.</p>
            ) : (
              available.slice(0, 12).map((stock) => (
                <div key={stock.instrument_token} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-3">
                  <span>
                    <span className="font-medium">{stock.tradingsymbol}</span>
                    <span className="mt-0.5 block text-xs text-muted">{stock.name}</span>
                  </span>
                  <button className="min-h-11 text-sm text-gold" onClick={() => void link(stock.instrument_token, false)}>
                    Link
                  </button>
                </div>
              ))
            )}
          </div>
          <h2 className="mt-6 text-sm font-medium text-muted">Linked stocks</h2>
          <div className="mt-2 flex flex-col gap-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted">Nothing linked yet.</p>
            ) : (
              members.map((stock) => (
                <div key={stock.instrument_token} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-3">
                  <span>
                    <span className="font-medium">{stock.tradingsymbol}</span>
                    <span className="mt-0.5 block text-xs text-muted">{stock.name}</span>
                  </span>
                  <button className="min-h-11 text-sm text-down" onClick={() => void link(stock.instrument_token, true)}>
                    Unlink
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
