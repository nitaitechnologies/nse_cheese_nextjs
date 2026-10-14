"use client";

import { useEffect, useRef, useState } from "react";
import { api, dated } from "./api";
import { useSessionDate } from "./SessionDate";
import EventFilters from "./EventFilters";
import StockCard from "./StockCard";
import { eventVisible, type EventFilter } from "@/lib/signals";
import type { InstrumentDoc, StockBoardRow } from "@/lib/types";

export default function Stocks() {
  const [query, setQuery] = useState("");
  const [filterText, setFilterText] = useState("");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [results, setResults] = useState<InstrumentDoc[]>([]);
  const [stocks, setStocks] = useState<StockBoardRow[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const { date, ready } = useSessionDate();
  const dateRef = useRef(date);
  dateRef.current = date;

  async function refresh() {
    const requested = date;
    const stockBody = await api<{ stocks: StockBoardRow[] }>(dated("/api/stocks", requested));
    if (dateRef.current !== requested) return;
    setStocks(stockBody.stocks);
    setLoaded(true);
  }

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load stocks"));
      void api<{ count: number }>("/api/instruments/search?q=")
        .then((body) => setCount(body.count))
        .catch(() => undefined);
    }, 0);
    const poll = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [date, ready]);

  useEffect(() => {
    if (query.trim().length < 1) {
      const clear = window.setTimeout(() => setResults([]), 0);
      return () => window.clearTimeout(clear);
    }
    const timer = window.setTimeout(() => {
      void api<{ items: InstrumentDoc[]; count: number }>(
        `/api/instruments/search?q=${encodeURIComponent(query.trim())}`,
      )
        .then((body) => {
          setResults(body.items.filter((item) => item.instrument_type === "EQ"));
          setCount(body.count);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Search failed"));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function add(token: number) {
    setError("");
    try {
      await api("/api/stocks", {
        method: "POST",
        body: JSON.stringify({ instrument_token: token }),
      });
      setQuery("");
      setResults([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the stock");
    }
  }

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

  const booked = new Set(stocks.map((stock) => stock.instrument_token));
  const needle = filterText.trim().toLowerCase();
  const visible = stocks.filter((stock) => {
    if (!eventVisible(stock.events, eventFilter)) return false;
    if (!needle) return true;
    return (
      stock.tradingsymbol.toLowerCase().includes(needle) ||
      stock.name.toLowerCase().includes(needle) ||
      stock.indices.some((index) => index.toLowerCase().includes(needle))
    );
  });

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <h1 className="text-2xl font-semibold">Stocks</h1>
      <p className="mt-1 text-sm text-muted">
        {count > 0
          ? `${stocks.length.toLocaleString("en-IN")} stocks in the book. Last, previous close, and the day's move.`
          : "Refresh index stocks from Setup, then they show up here."}
      </p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Add a symbol"
        className="mt-4 min-h-12 w-full rounded-xl border border-line bg-panel px-3 outline-none"
      />
      {results.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-2xl border border-line">
          {results.map((item) => {
            const added = booked.has(item.instrument_token);
            return (
              <button
                key={item.instrument_token}
                className="flex min-h-12 w-full items-center justify-between border-b border-line px-3 text-left last:border-b-0 active:bg-panel"
                onClick={() => void add(item.instrument_token)}
                disabled={added}
              >
                <span>
                  <span className="font-medium">{item.tradingsymbol}</span>
                  <span className="mt-0.5 block text-xs text-muted">{item.name}</span>
                </span>
                <span className="text-sm text-gold">{added ? "Added" : "Add"}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <input
        value={filterText}
        onChange={(event) => setFilterText(event.target.value)}
        placeholder="Filter symbol, name, or index"
        className="mt-4 min-h-12 w-full rounded-xl border border-line bg-panel px-3 outline-none"
      />
      <EventFilters value={eventFilter} onChange={setEventFilter} />
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      <div className="mt-4 flex flex-col gap-2">
        {!loaded ? (
          <p className="text-sm text-muted">Loading stocks…</p>
        ) : stocks.length === 0 ? (
          <p className="text-sm text-muted">No stocks in the book yet.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted">No stocks match this filter.</p>
        ) : (
          visible.map((stock) => (
            <StockCard key={stock.instrument_token} stock={stock} onRemove={(token) => void remove(token)} />
          ))
        )}
      </div>
    </main>
  );
}
