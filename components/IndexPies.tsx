"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import BreadthPie from "./Pie";
import type { IndexCard, IndexRow } from "@/lib/types";

function breadthOf(index: IndexRow): IndexCard {
  return {
    label: index.name,
    symbol: index.symbol,
    advance: index.advance,
    decline: index.decline,
    unchanged: index.unchanged,
    unpriced: index.unpriced,
    total: index.count,
    missing: false,
    last: index.last,
    prevClose: index.prevClose,
    change: index.change,
    changePct: index.changePct,
  };
}

export default function IndexPies({
  symbols,
  onClose,
  columns = 1,
}: {
  symbols: string[];
  onClose: (symbol: string) => void;
  columns?: 1 | 2;
}) {
  const [indices, setIndices] = useState<IndexRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let gone = false;
    async function refresh() {
      try {
        const body = await api<{ indices: IndexRow[] }>("/api/indices");
        if (!gone) {
          setIndices(body.indices);
          setLoaded(true);
        }
      } catch {
        if (!gone) setLoaded(true);
      }
    }
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    const poll = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      gone = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, []);

  if (symbols.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
        Click an index on a stock to open its pie.
      </p>
    );
  }

  return (
    <div className={columns === 2 ? "grid grid-cols-2 items-start gap-3" : "flex flex-col gap-3"}>
      {symbols.map((symbol) => {
        const index = indices.find((item) => item.symbol === symbol);
        return (
          <div key={symbol}>
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                className="min-h-9 rounded-xl px-2 text-xs text-muted"
                onClick={() => onClose(symbol)}
              >
                Close
              </button>
            </div>
            {!loaded ? (
              <p className="rounded-2xl border border-line px-4 py-6 text-sm text-muted">Loading {symbol}…</p>
            ) : index ? (
              <BreadthPie breadth={breadthOf(index)} />
            ) : (
              <p className="rounded-2xl border border-line px-4 py-6 text-sm text-muted">{symbol} is not in the book.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
