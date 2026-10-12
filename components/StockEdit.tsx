"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { IndexRow, InstrumentDoc, StockBoardRow } from "@/lib/types";

export default function StockEdit({ token }: { token: string }) {
  const router = useRouter();
  const [stock, setStock] = useState<StockBoardRow | null>(null);
  const [indices, setIndices] = useState<IndexRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstrumentDoc[]>([]);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);

  async function load(current = token) {
    const [stockBody, indexBody] = await Promise.all([
      api<{ stocks: StockBoardRow[] }>("/api/stocks"),
      api<{ indices: IndexRow[] }>("/api/indices"),
    ]);
    setIndices(indexBody.indices);
    const row = stockBody.stocks.find((item) => String(item.instrument_token) === current) ?? null;
    setStock(row);
    setMissing(row == null);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load the stock"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token]);

  useEffect(() => {
    if (query.trim().length < 1) {
      const clear = window.setTimeout(() => setResults([]), 0);
      return () => window.clearTimeout(clear);
    }
    const timer = window.setTimeout(() => {
      void api<{ items: InstrumentDoc[] }>(`/api/instruments/search?q=${encodeURIComponent(query.trim())}`)
        .then((body) => setResults(body.items.filter((item) => item.instrument_type === "EQ")))
        .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function changeSymbol(nextToken: number) {
    if (!stock) return;
    setError("");
    try {
      const body = await api<{ stock: StockBoardRow }>("/api/stocks", {
        method: "PATCH",
        body: JSON.stringify({ instrument_token: stock.instrument_token, next_token: nextToken }),
      });
      setQuery("");
      setResults([]);
      router.replace(`/stocks/${body.stock.instrument_token}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the symbol");
    }
  }

  async function toggle(symbol: string, linked: boolean) {
    if (!stock) return;
    setError("");
    try {
      await api("/api/links", {
        method: linked ? "DELETE" : "POST",
        body: JSON.stringify({ symbol, instrument_token: stock.instrument_token }),
      });
      await load(String(stock.instrument_token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the link");
    }
  }

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <Link href="/stocks" className="inline-flex min-h-11 items-center text-gold">
        Back
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{stock?.tradingsymbol ?? "Edit stock"}</h1>
      <p className="mt-1 text-sm text-muted">{stock ? stock.name : "Change the symbol and the indices it belongs to."}</p>
      {missing ? <p className="mt-4 text-sm text-down">This stock is not in the book.</p> : null}
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      {stock ? (
        <>
          <h2 className="mt-6 text-sm font-medium text-muted">Symbol</h2>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a replacement symbol"
            className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3 outline-none"
          />
          {results.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-2xl border border-line">
              {results.map((item) => (
                <button
                  key={item.instrument_token}
                  className="flex min-h-12 w-full items-center justify-between border-b border-line px-3 text-left last:border-b-0 active:bg-panel"
                  onClick={() => void changeSymbol(item.instrument_token)}
                  disabled={item.instrument_token === stock.instrument_token}
                >
                  <span>
                    <span className="font-medium">{item.tradingsymbol}</span>
                    <span className="mt-0.5 block text-xs text-muted">{item.name}</span>
                  </span>
                  <span className="text-sm text-gold">
                    {item.instrument_token === stock.instrument_token ? "Current" : "Use"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <h2 className="mt-6 text-sm font-medium text-muted">Linked indices</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {indices.length === 0 ? (
              <p className="text-xs text-muted">Create an index before linking.</p>
            ) : (
              indices.map((index) => {
                const on = stock.indices.includes(index.symbol);
                return (
                  <button
                    key={index.symbol}
                    className={`min-h-9 rounded-full border px-3 text-xs ${
                      on ? "border-gold bg-gold font-semibold text-ink" : "border-line text-muted"
                    }`}
                    onClick={() => void toggle(index.symbol, on)}
                  >
                    {index.symbol}
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
