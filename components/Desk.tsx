"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { levelText, money, tickAge } from "./format";
import PickedIndices from "./PickedIndices";
import BreadthPie from "./Pie";
import type { DashboardBreadth, DashboardPayload, WatchRow } from "@/lib/types";

type QuoteEvent = {
  instrument_token: number;
  candle: { close: number };
};

export default function Desk() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [breadth, setBreadth] = useState<DashboardBreadth | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    try {
      const next = await api<DashboardPayload>("/api/dashboard");
      setData(next);
      setBreadth(next.breadth);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the desk");
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => {
      setNow(Date.now());
      void load();
    }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const source = new EventSource("/api/stream");
    source.addEventListener("quotes", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as QuoteEvent[];
      setData((current) => (current ? applyPrices(current, payload) : current));
    });
    source.addEventListener("breakout", () => void load());
    source.addEventListener("status", (event) => {
      const status = JSON.parse((event as MessageEvent).data) as DashboardPayload["worker"];
      setData((current) => (current ? { ...current, worker: status } : current));
    });
    const breadthTimer = window.setInterval(() => {
      void api<DashboardBreadth>("/api/breadth")
        .then(setBreadth)
        .catch(() => undefined);
    }, 15000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(clock);
      window.clearInterval(breadthTimer);
      source.close();
    };
  }, [load]);

  if (!data && !error) {
    return <p className="px-4 pt-8 text-muted">Loading the session…</p>;
  }
  if (!data) {
    return (
      <div className="px-4 pt-8">
        <p className="text-down">{error}</p>
        <button className="mt-4 min-h-12 rounded-xl bg-panel px-4" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  const quiet = data.watching.filter((row) => !row.signal);
  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">NSE cash</p>
          <h1 className="text-2xl font-semibold">Breakouts</h1>
        </div>
        <p className="font-mono text-sm text-muted">{data.date}</p>
      </header>
      <Status data={data} now={now} />
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      <section className="mt-6">
        <h2 className="text-sm font-medium text-muted">Advance / decline</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <BreadthPie breadth={(breadth ?? data.breadth).market} />
          <BreadthPie breadth={(breadth ?? data.breadth).nifty50} />
          <BreadthPie breadth={(breadth ?? data.breadth).banknifty} />
        </div>
      </section>
      <PickedIndices />
      <section className="mt-6">
        <h2 className="text-sm font-medium text-muted">Closed through the prior day</h2>
        {data.breakouts.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
            No 5-minute close has cleared the previous high or low yet.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {data.breakouts.map((signal) => (
              <Link
                key={`${signal.instrument_token}-${signal.side}`}
                href={`/chart/${signal.instrument_token}?date=${signal.date}`}
                className="rounded-2xl border border-line bg-panel p-4 active:bg-panel-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{signal.tradingsymbol}</p>
                    <p className={signal.side === "PDH" ? "text-up" : "text-down"}>
                      {signal.side} · {signal.time} IST
                    </p>
                  </div>
                  <span className="rounded-full bg-gold px-3 py-1 text-sm font-semibold text-ink">
                    {signal.strength}
                  </span>
                </div>
                <p className="mt-3 font-mono text-sm text-muted">
                  Close {money(signal.close)} · level {money(signal.level)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Vol {signal.volumeScore} · wick {signal.wickScore} · depth {signal.depthScore}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">Still inside the range</h2>
        {data.watching.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No stocks in the book yet. Refresh them from Setup.</p>
        ) : quiet.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Every watched name has already broken.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {quiet.map((row) => (
              <WatchLine key={row.instrument_token} row={row} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Status({ data, now }: { data: DashboardPayload; now: number }) {
  const live = data.worker.connected && data.kite.connected;
  const tone = live ? "text-up" : "text-gold";
  return (
    <div className="mt-4 rounded-2xl border border-line bg-panel px-4 py-3">
      <p className={`text-sm font-medium ${tone}`}>
        {data.kite.connected ? data.worker.message : "Kite login required"}
      </p>
      <p className="mt-1 text-xs text-muted">
        {data.kite.connected
          ? `${data.kite.userName ?? data.kite.userId} · tick ${tickAge(data.worker.lastTickAt, now)}`
          : "Connect Kite from Setup before the open."}
      </p>
    </div>
  );
}

function WatchLine({ row }: { row: WatchRow }) {
  return (
    <Link
      href={`/chart/${row.instrument_token}`}
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 active:bg-panel"
    >
      <div>
        <p className="font-medium">{row.tradingsymbol}</p>
        <p className="text-xs text-muted">
          {levelText("high", row.distHighPct)} · {levelText("low", row.distLowPct)}
        </p>
      </div>
      <p className="font-mono text-sm">{money(row.last)}</p>
    </Link>
  );
}

function applyPrices(data: DashboardPayload, events: QuoteEvent[]): DashboardPayload {
  const prices = new Map(events.map((event) => [event.instrument_token, event.candle.close]));
  if (prices.size === 0) return data;
  let changed = false;
  const watching = data.watching.map((row) => {
    const last = prices.get(row.instrument_token);
    if (last == null || last === row.last) return row;
    changed = true;
    return {
      ...row,
      last,
      distHighPct: row.pdh == null || !last ? null : ((row.pdh - last) / last) * 100,
      distLowPct: row.pdl == null || !last ? null : ((last - row.pdl) / last) * 100,
    };
  });
  return changed ? { ...data, watching } : data;
}
