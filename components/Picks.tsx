"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, dated } from "./api";
import { useSessionDate } from "./SessionDate";
import BreakCard from "./BreakCard";
import BreakGroups from "./BreakGroups";
import IndexPies from "./IndexPies";
import { usePiePicks } from "./usePiePicks";
import type { BreakPickRow } from "@/lib/types";

export default function Picks() {
  const [stocks, setStocks] = useState<BreakPickRow[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const { openIndices, stamp, accept, toggle } = usePiePicks();
  const { date, ready, live } = useSessionDate();
  const dateRef = useRef(date);
  dateRef.current = date;

  async function refresh() {
    const requested = date;
    const seen = stamp();
    const body = await api<{ stocks: BreakPickRow[]; pies: string[] }>(dated("/api/picks", requested));
    if (dateRef.current !== requested) return;
    setStocks(body.stocks);
    accept(body.pies, seen);
    setLoaded(true);
  }

  async function toggleIndex(symbol: string) {
    try {
      await toggle(symbol);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not store the pie");
    }
  }

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load picked stocks"));
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

  async function uncheck(token: number) {
    setError("");
    setBusy(true);
    try {
      await api("/api/picks", {
        method: "DELETE",
        body: JSON.stringify({ instrument_token: token }),
      });
      setPending(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not uncheck the stock");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError("");
    setBusy(true);
    try {
      await api("/api/picks", {
        method: "DELETE",
        body: JSON.stringify({ all: true }),
      });
      setConfirmReset(false);
      setPending(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the list");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Picked</h1>
          <p className="mt-1 text-sm text-muted">
            Stocks checked on{" "}
            <Link href="/breaks" className="text-gold">
              Breaks
            </Link>
            ,{" "}
            <Link href="/probes" className="text-gold">
              Probed
            </Link>
            , or{" "}
            <Link href="/stocks" className="text-gold">
              Stocks
            </Link>
            . Reset clears every check.
          </p>
        </div>
        {loaded && stocks.length > 0 && !confirmReset ? (
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm text-down"
            disabled={busy}
            onClick={() => {
              setPending(null);
              setConfirmReset(true);
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
      {confirmReset ? (
        <div className="mt-4 rounded-2xl border border-line bg-panel px-4 py-3">
          <p className="text-sm">Uncheck every stock on this list?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl px-3 text-sm"
              disabled={busy}
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl px-3 text-sm text-down"
              disabled={busy}
              onClick={() => void reset()}
            >
              Uncheck all
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
        {!loaded ? (
          <p className="text-sm text-muted">Loading picked stocks…</p>
        ) : stocks.length === 0 ? (
          <p className="text-sm text-muted">No stocks checked yet.</p>
        ) : (
          <>
          <BreakGroups
            stocks={stocks}
            columns={2}
            extra={
              stocks.some((stock) => stock.events.length === 0) ? (
                <>
                  <h2 className="mt-3 text-sm font-medium text-muted">
                    No break{" "}
                    <span className="font-mono">
                      {stocks.filter((stock) => stock.events.length === 0).length}
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 items-stretch gap-2">
                  {stocks
                    .filter((stock) => stock.events.length === 0)
                    .map((stock) => (
                      <div key={stock.instrument_token} className="h-full">
                      <BreakCard
                        stock={stock}
                        openIndices={openIndices}
                        onIndex={(symbol) => void toggleIndex(symbol)}
                      >
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
                        ) : (
                          <button
                            type="button"
                            className="min-h-11 rounded-xl px-3 text-sm text-down"
                            disabled={busy}
                            onClick={() => {
                              setConfirmReset(false);
                              setPending(stock.instrument_token);
                            }}
                          >
                            Uncheck
                          </button>
                        )}
                      </BreakCard>
                      </div>
                    ))}
                  </div>
                </>
              ) : null
            }
            render={(stock, side) => (
            <BreakCard
              stock={stock}
              side={side}
              openIndices={openIndices}
              onIndex={(symbol) => void toggleIndex(symbol)}
            >
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
              ) : (
                <button
                  type="button"
                  className="min-h-11 rounded-xl px-3 text-sm text-down"
                  disabled={busy}
                  onClick={() => {
                    setConfirmReset(false);
                    setPending(stock.instrument_token);
                  }}
                >
                  Uncheck
                </button>
              )}
            </BreakCard>
            )}
          />
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
