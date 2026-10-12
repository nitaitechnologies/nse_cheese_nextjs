"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./api";
import { money, signed, signedPct, tone } from "./format";
import type { IndexRow } from "@/lib/types";

function indexPath(symbol: string): string {
  return `/indices/${encodeURIComponent(symbol)}`;
}

export default function Indices() {
  const [indices, setIndices] = useState<IndexRow[]>([]);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const body = await api<{ indices: IndexRow[] }>("/api/indices");
    setIndices(body.indices);
    setLoaded(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load indices"));
    }, 0);
    const poll = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, []);

  async function create() {
    setError("");
    try {
      await api("/api/indices", {
        method: "POST",
        body: JSON.stringify({ symbol, name }),
      });
      setSymbol("");
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the index");
    }
  }

  async function removeIndex(indexSymbol: string) {
    setError("");
    try {
      await api("/api/indices", {
        method: "DELETE",
        body: JSON.stringify({ symbol: indexSymbol }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the index");
    }
  }

  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <h1 className="text-2xl font-semibold">Indices</h1>
      <p className="mt-1 text-sm text-muted">
        Last, previous close, the day&apos;s move, and how many members are advancing or declining.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          placeholder="Symbol, e.g. NIFTY 50"
          className="min-h-12 rounded-xl border border-line bg-panel px-3 outline-none"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name, optional"
          className="min-h-12 rounded-xl border border-line bg-panel px-3 outline-none"
        />
      </div>
      <button className="mt-3 min-h-12 rounded-xl bg-gold px-4 font-semibold text-ink" onClick={() => void create()}>
        Add index
      </button>
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      <div className="mt-6 flex flex-col gap-2">
        {!loaded ? (
          <p className="text-sm text-muted">Loading indices…</p>
        ) : indices.length === 0 ? (
          <p className="text-sm text-muted">No indices yet.</p>
        ) : (
          indices.map((index) => (
            <article key={index.symbol} className="rounded-2xl border border-line px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{index.symbol}</p>
                  <p className="text-xs text-muted">{index.name}</p>
                </div>
                <div className="text-right">
                  <p className={`font-mono ${tone(index.change)}`}>{money(index.last)}</p>
                  <p className={`font-mono text-xs ${tone(index.change)}`}>
                    {signed(index.change)} · {signedPct(index.changePct)}
                  </p>
                </div>
              </div>
              <p className="mt-1 font-mono text-xs text-muted">Prev close {money(index.prevClose)}</p>
              <p className="mt-1 text-xs">
                <span className="font-mono text-up">{index.advance} adv</span>
                <span className="text-muted"> · </span>
                <span className="font-mono text-down">{index.decline} dec</span>
                {index.unchanged > 0 ? <span className="text-muted"> · {index.unchanged} flat</span> : null}
                {index.unpriced > 0 ? <span className="text-muted"> · {index.unpriced} no price</span> : null}
                <span className="text-muted"> · {index.count} stocks</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link
                  href={indexPath(index.symbol)}
                  className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold"
                >
                  View
                </Link>
                <Link
                  href={`${indexPath(index.symbol)}/edit`}
                  className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold"
                >
                  Edit
                </Link>
                <button className="min-h-11 rounded-xl px-3 text-sm text-down" onClick={() => void removeIndex(index.symbol)}>
                  Remove
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </main>
  );
}
