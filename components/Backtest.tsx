"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "./api";
import { money } from "./format";
import { istDateString } from "@/lib/time";
import type { SignalDoc } from "@/lib/types";

type Result = {
  date: string;
  signals: SignalDoc[];
  scanned: number;
  withCandles: number;
  message: string;
};

export default function Backtest() {
  const [date, setDate] = useState(istDateString(new Date()));
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    try {
      setResult(await api<Result>("/api/backtest", { method: "POST", body: JSON.stringify({ date }) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-semibold">Replay a session</h1>
      <p className="mt-1 text-sm text-muted">
        Uses stored 5-minute candles and the same close-through rule as the live desk.
      </p>
      <label className="mt-4 block text-sm text-muted" htmlFor="session-date">
        Session date
      </label>
      <input
        id="session-date"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-xl border border-line bg-panel px-3"
      />
      <button
        className="mt-3 min-h-12 w-full rounded-xl bg-gold font-semibold text-ink disabled:opacity-60"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Scanning…" : "Show breaks"}
      </button>
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      {result?.message ? <p className="mt-3 text-sm text-gold">{result.message}</p> : null}
      {result && !result.message ? (
        <p className="mt-4 text-sm text-muted">
          {result.signals.length} breaks across {result.withCandles} symbols with candles.
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">
        {result?.signals.map((signal) => (
          <Link
            key={`${signal.instrument_token}-${signal.side}`}
            href={`/chart/${signal.instrument_token}?date=${result.date}`}
            className="rounded-2xl border border-line bg-panel p-4 active:bg-panel-2"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold">{signal.tradingsymbol}</p>
                <p className={signal.side === "PDH" ? "text-up" : "text-down"}>
                  {signal.side} at {signal.time}
                </p>
              </div>
              <span className="rounded-full bg-gold px-3 py-1 text-sm font-semibold text-ink">
                {signal.strength}
              </span>
            </div>
            <p className="mt-2 font-mono text-sm text-muted">
              Close {money(signal.close)} · level {money(signal.level)}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
