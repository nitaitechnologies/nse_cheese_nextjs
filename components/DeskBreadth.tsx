"use client";

import { useEffect, useState } from "react";
import { breadthSlot } from "@/lib/breadth";
import type { DashboardBreadth, IndexCard, IndexRow } from "@/lib/types";
import { api, dated } from "./api";
import BreadthPie from "./Pie";

export default function DeskBreadth({
  breadth,
  date,
  onBreadth,
}: {
  breadth: DashboardBreadth;
  date: string;
  onBreadth: (next: DashboardBreadth) => void;
}) {
  const [open, setOpen] = useState(false);
  const [indices, setIndices] = useState<IndexRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let gone = false;
    void api<{ indices: IndexRow[] }>(dated("/api/indices", date))
      .then((body) => {
        if (!gone) setIndices(body.indices);
      })
      .catch((err) => {
        if (!gone) setError(err instanceof Error ? err.message : "Could not load indices");
      });
    return () => {
      gone = true;
    };
  }, [open, date]);

  const shown = new Set(
    [breadth.nifty50.symbol, breadth.banknifty.symbol, ...(breadth.extras ?? []).map((item) => item.symbol)].filter(
      (symbol): symbol is string => Boolean(symbol),
    ),
  );
  const needle = query.trim().toLowerCase();
  const choices = (indices ?? []).filter((index) => {
    if (shown.has(index.symbol) || breadthSlot(index.symbol)) return false;
    if (!needle) return true;
    return index.symbol.toLowerCase().includes(needle) || index.name.toLowerCase().includes(needle);
  });
  const cards: IndexCard[] = [breadth.market, breadth.nifty50, breadth.banknifty, ...(breadth.extras ?? [])];

  async function refresh() {
    onBreadth(await api<DashboardBreadth>(dated("/api/breadth", date)));
  }

  async function add(symbol: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/desk-pies", { method: "POST", body: JSON.stringify({ symbol }) });
      await refresh();
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the index");
    } finally {
      setBusy(false);
    }
  }

  async function remove(symbol: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/desk-pies", { method: "DELETE", body: JSON.stringify({ symbol }) });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the index");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-muted">Advance / decline</h2>
      {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      {open ? (
        <div className="mt-3 rounded-2xl border border-line bg-panel p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search an index to add"
            className="min-h-12 w-full rounded-xl border border-line bg-ink px-3 outline-none"
          />
          <div className="mt-2 max-h-56 overflow-y-auto">
            {indices == null ? (
              <p className="px-1 py-3 text-sm text-muted">Loading indices…</p>
            ) : choices.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted">
                {indices.length === 0
                  ? "No indices in the book yet."
                  : needle
                    ? "No indices match."
                    : "Every other index is already on the desk."}
              </p>
            ) : (
              choices.map((index) => (
                <button
                  key={index.symbol}
                  type="button"
                  disabled={busy}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 text-left hover:bg-panel-2 disabled:opacity-60"
                  onClick={() => void add(index.symbol)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{index.symbol}</span>
                    {index.name !== index.symbol ? (
                      <span className="block truncate text-xs text-muted">{index.name}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-gold">Add</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
      <div className="mt-3 grid grid-cols-4 items-stretch gap-3 [&_article]:min-w-0 [&_article]:w-full [&_article]:flex-none">
        {cards.map((card) => {
          const removable = Boolean(card.symbol) && !breadthSlot(card.symbol ?? "");
          return (
            <BreadthPie
              key={card.symbol ?? card.label}
              breadth={card}
              onRemove={removable && card.symbol ? () => void remove(card.symbol as string) : undefined}
            />
          );
        })}
        <button
          type="button"
          className="flex h-full min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-panel px-3 py-4 text-sm font-medium text-muted"
          onClick={() => {
            setError("");
            setOpen((current) => !current);
          }}
        >
          {open ? "Close" : "Add index"}
        </button>
      </div>
    </section>
  );
}
