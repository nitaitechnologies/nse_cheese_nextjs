"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./api";
import BreakCard from "./BreakCard";
import BreakGroups from "./BreakGroups";
import IndexPies from "./IndexPies";
import { usePiePicks } from "./usePiePicks";
import type { BreakPickRow } from "@/lib/types";

export default function Breaks() {
  const [stocks, setStocks] = useState<BreakPickRow[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const { openIndices, stamp, accept, toggle } = usePiePicks();

  async function refresh() {
    const seen = stamp();
    const body = await api<{ stocks: BreakPickRow[]; pies: string[] }>("/api/breaks");
    setStocks(body.stocks);
    accept(body.pies, seen);
    setLoaded(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load breaks"));
    }, 0);
    const source = new EventSource("/api/stream");
    source.addEventListener("breakout", () => {
      void refresh().catch(() => undefined);
    });
    const poll = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      source.close();
    };
  }, []);

  function mark(token: number, picked: boolean) {
    setStocks((current) =>
      current.map((stock) => (stock.instrument_token === token ? { ...stock, picked } : stock)),
    );
  }

  async function keep(token: number) {
    setError("");
    setBusy(true);
    mark(token, true);
    try {
      await api("/api/picks", {
        method: "POST",
        body: JSON.stringify({ instrument_token: token }),
      });
      setPending(null);
      await refresh();
    } catch (err) {
      mark(token, false);
      setError(err instanceof Error ? err.message : "Could not store the stock");
    } finally {
      setBusy(false);
    }
  }

  async function uncheck(token: number) {
    setError("");
    setBusy(true);
    mark(token, false);
    try {
      await api("/api/picks", {
        method: "DELETE",
        body: JSON.stringify({ instrument_token: token }),
      });
      setPending(null);
      await refresh();
    } catch (err) {
      mark(token, true);
      setError(err instanceof Error ? err.message : "Could not uncheck the stock");
    } finally {
      setBusy(false);
    }
  }

  async function toggleIndex(symbol: string) {
    try {
      await toggle(symbol);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not store the pie");
    }
  }

  const needle = query.trim().toLowerCase();
  const visible = stocks.filter((stock) => {
    if (!needle) return true;
    return (
      stock.tradingsymbol.toLowerCase().includes(needle) ||
      stock.name.toLowerCase().includes(needle) ||
      stock.indices.some((index) => index.toLowerCase().includes(needle))
    );
  });

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <h1 className="text-2xl font-semibold">Breaks</h1>
      <p className="mt-1 text-sm text-muted">
        Stocks that closed through the previous day high or low. Check a name to store it. Saved names are on{" "}
        <Link href="/picks" className="text-gold">
          Picked
        </Link>
        .
      </p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search symbol, name, or index"
        className="mt-4 min-h-12 w-full rounded-xl border border-line bg-panel px-3 outline-none"
      />
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
        {!loaded ? (
          <p className="text-sm text-muted">Loading breaks…</p>
        ) : stocks.length === 0 ? (
          <p className="text-sm text-muted">No stock has closed through the previous high or low yet.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted">No stocks match this search.</p>
        ) : (
          <BreakGroups
            stocks={visible}
            columns={2}
            render={(stock) => (
            <BreakCard
              stock={stock}
              copyIndex={false}
              openIndices={openIndices}
              onIndex={(symbol) => void toggleIndex(symbol)}
            >
              <label className="inline-flex min-h-11 items-center gap-2 px-3 text-sm">
                <input
                  type="checkbox"
                  className="size-5 accent-gold"
                  checked={stock.picked}
                  disabled={busy}
                  onChange={(event) => {
                    if (event.target.checked) {
                      void keep(stock.instrument_token);
                      return;
                    }
                    setPending(stock.instrument_token);
                  }}
                />
                Keep
              </label>
              {pending === stock.instrument_token ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm">Uncheck {stock.tradingsymbol}?</p>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl px-3 text-sm"
                    disabled={busy}
                    onClick={() => setPending(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl px-3 text-sm text-down"
                    disabled={busy}
                    onClick={() => void uncheck(stock.instrument_token)}
                  >
                    Uncheck
                  </button>
                </div>
              ) : null}
            </BreakCard>
            )}
          />
        )}
        </div>
        <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <IndexPies columns={2} symbols={openIndices} onClose={(symbol) => void toggleIndex(symbol)} />
        </aside>
      </div>
    </main>
  );
}
