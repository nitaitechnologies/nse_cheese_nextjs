"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, dated } from "./api";
import { useSessionDate } from "./SessionDate";
import BreakCard from "./BreakCard";
import BreakGroups from "./BreakGroups";
import IndexPies from "./IndexPies";
import { usePiePicks } from "./usePiePicks";
import { latestSideEvent } from "@/lib/signals";
import type { BreakPickRow, Side } from "@/lib/types";

const STRENGTHS = [1, 2, 3, 4, 5] as const;

function matchesQuery(stock: BreakPickRow, needle: string): boolean {
  if (!needle) return true;
  return (
    stock.tradingsymbol.toLowerCase().includes(needle) ||
    stock.name.toLowerCase().includes(needle) ||
    stock.indices.some((index) => index.toLowerCase().includes(needle))
  );
}

export default function Breaks() {
  const [stocks, setStocks] = useState<BreakPickRow[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [minStrength, setMinStrength] = useState(1);
  const { openIndices, stamp, accept, toggle } = usePiePicks();
  const { date, ready, live } = useSessionDate();
  const dateRef = useRef(date);
  dateRef.current = date;

  async function refresh() {
    const requested = date;
    const seen = stamp();
    const body = await api<{ stocks: BreakPickRow[]; pies: string[] }>(dated("/api/breaks", requested));
    if (dateRef.current !== requested) return;
    setStocks(body.stocks);
    accept(body.pies, seen);
    setLoaded(true);
  }

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load breaks"));
    }, 0);
    let source: EventSource | null = null;
    if (live) {
      source = new EventSource("/api/stream");
      source.addEventListener("breakout", () => {
        void refresh().catch(() => undefined);
      });
    }
    const poll = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      source?.close();
    };
  }, [date, ready, live]);

  function mark(token: number, picked: boolean) {
    setStocks((current) =>
      current.map((stock) => (stock.instrument_token === token ? { ...stock, picked } : stock)),
    );
  }

  function markHidden(token: number, hidden: boolean) {
    setStocks((current) =>
      current.map((stock) => (stock.instrument_token === token ? { ...stock, hidden } : stock)),
    );
  }

  async function keep(token: number) {
    setError("");
    setBusy(true);
    mark(token, true);
    try {
      await api("/api/picks", {
        method: "POST",
        body: JSON.stringify({ instrument_token: token, date }),
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

  async function hide(token: number, hidden: boolean) {
    setError("");
    setBusy(true);
    markHidden(token, hidden);
    try {
      await api("/api/hides", {
        method: hidden ? "POST" : "DELETE",
        body: JSON.stringify({ instrument_token: token, date }),
      });
      await refresh();
    } catch (err) {
      markHidden(token, !hidden);
      setError(err instanceof Error ? err.message : hidden ? "Could not hide the stock" : "Could not show the stock");
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
  const searched = stocks.filter((stock) => matchesQuery(stock, needle));
  function liveBreaks(stock: BreakPickRow, min: number): Side[] {
    return (["PDH", "PDL"] as const).filter((side) => {
      const latest = latestSideEvent(stock.events, side);
      return latest?.kind === "break" && latest.strength >= min;
    });
  }
  const listed = searched.filter((stock) => !stock.hidden);
  const strengthCounts = STRENGTHS.map(
    (min) => listed.reduce((total, stock) => total + liveBreaks(stock, min).length, 0),
  );
  const visible = searched.filter((stock) => stock.hidden || liveBreaks(stock, minStrength).length > 0);

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <h1 className="text-2xl font-semibold">Breaks</h1>
      <p className="mt-1 text-sm text-muted">
        Stocks still closed through the previous day high or low. A name that broke and then probed stays on Probed.
        Check a name to store it. Hide a name to leave it off All, High, and Low. Hidden names and picked names clear
        on the first Kite login of the day. Saved names are on{" "}
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
          <p className="text-sm text-muted">No stock is still closed through the previous high or low.</p>
        ) : (
          <>
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="shrink-0 text-xs text-muted">Strength</span>
            {STRENGTHS.map((value, index) => (
              <button
                key={value}
                type="button"
                aria-pressed={minStrength === value}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${
                  minStrength === value
                    ? "border-gold bg-gold font-semibold text-ink"
                    : "border-line text-muted"
                }`}
                onClick={() => setMinStrength(value)}
              >
                {value}+ {strengthCounts[index]}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-muted">
              {searched.length === 0
                ? "No stocks match this search."
                : `No breaks at strength ${minStrength} or higher.`}
            </p>
          ) : (
            <BreakGroups
              stocks={visible}
              columns={2}
              mode="break"
              minStrength={minStrength}
              conceal
              render={(stock, side) => (
                <BreakCard
                  stock={stock}
                  side={side}
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
                  <label className="inline-flex min-h-11 items-center gap-2 px-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-5 accent-gold"
                      checked={stock.hidden}
                      disabled={busy}
                      onChange={(event) => void hide(stock.instrument_token, event.target.checked)}
                    />
                    Hide
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
          </>
        )}
        </div>
        <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <IndexPies columns={2} symbols={openIndices} onClose={(symbol) => void toggleIndex(symbol)} />
        </aside>
      </div>
    </main>
  );
}
