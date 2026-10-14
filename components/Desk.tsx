"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, dated } from "./api";
import { useSessionDate } from "./SessionDate";
import { tickAge } from "./format";
import DeskBreadth from "./DeskBreadth";
import PickedIndices from "./PickedIndices";
import type { DashboardBreadth, DashboardPayload } from "@/lib/types";

export default function Desk() {
  const { date, live, ready } = useSessionDate();
  const dateRef = useRef(date);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [breadth, setBreadth] = useState<DashboardBreadth | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const requested = date;
    try {
      const next = await api<DashboardPayload>(dated("/api/dashboard", requested));
      if (dateRef.current !== requested) return;
      setData(next);
      setBreadth(next.breadth);
      setError("");
    } catch (err) {
      if (dateRef.current !== requested) return;
      setError(err instanceof Error ? err.message : "Could not load the desk");
    }
  }, [date]);

  useEffect(() => {
    if (!ready) return;
    const first = window.setTimeout(() => {
      setNow(Date.now());
      void load();
    }, 0);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    let source: EventSource | null = null;
    let breadthTimer: number | undefined;
    if (live) {
      source = new EventSource("/api/stream");
      source.addEventListener("breakout", () => void load());
      source.addEventListener("status", (event) => {
        const status = JSON.parse((event as MessageEvent).data) as DashboardPayload["worker"];
        setData((current) => (current ? { ...current, worker: status } : current));
      });
      breadthTimer = window.setInterval(() => {
        void api<DashboardBreadth>(dated("/api/breadth", date))
          .then(setBreadth)
          .catch(() => undefined);
      }, 15000);
    }
    return () => {
      window.clearTimeout(first);
      window.clearInterval(clock);
      if (breadthTimer != null) window.clearInterval(breadthTimer);
      source?.close();
    };
  }, [load, ready, live, date]);

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

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">NSE cash</p>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
        </div>
        <p className="font-mono text-sm text-muted">{data.date}</p>
      </header>
      <Status data={data} now={now} />
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      <DeskBreadth breadth={breadth ?? data.breadth} date={date} onBreadth={setBreadth} />
      <PickedIndices />
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

