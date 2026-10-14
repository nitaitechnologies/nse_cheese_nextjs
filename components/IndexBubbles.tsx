"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function IndexBubbles({
  indices,
  openIndices = [],
  onIndex,
}: {
  indices: string[];
  openIndices?: string[];
  onIndex?: (symbol: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = indices.find((symbol) => openIndices.includes(symbol)) ?? indices[0];
  const hidden = shown ? indices.filter((symbol) => symbol !== shown) : [];

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!shown) {
    return (
      <div className="mt-2 flex h-7 items-center">
        <p className="text-xs text-muted">No index</p>
      </div>
    );
  }

  const highlighted = openIndices.includes(shown);

  return (
    <>
      <div className="mt-2 flex h-7 items-center gap-1.5">
        {onIndex ? (
          <button
            type="button"
            aria-pressed={highlighted}
            className={`inline-flex h-7 max-w-[11rem] items-center rounded-full border px-2.5 text-xs ${
              highlighted ? "border-gold text-gold" : "border-line text-muted"
            }`}
            onClick={() => onIndex(shown)}
          >
            <span className="truncate">{shown}</span>
          </button>
        ) : (
          <Link
            href={`/indices/${encodeURIComponent(shown)}`}
            className="inline-flex h-7 max-w-[11rem] items-center rounded-full border border-line px-2.5 text-xs text-muted"
          >
            <span className="truncate">{shown}</span>
          </Link>
        )}
        {hidden.length > 0 ? (
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center rounded-full border border-line px-2 text-xs text-gold"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            +{hidden.length}
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Other indices"
            className="w-full max-w-sm rounded-2xl border border-line bg-panel p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Indices</p>
              <button type="button" className="min-h-11 px-2 text-sm text-muted" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {hidden.map((symbol) => {
                const active = openIndices.includes(symbol);
                const className = `inline-flex min-h-9 items-center rounded-full border px-3 text-xs ${
                  active ? "border-gold text-gold" : "border-line text-muted"
                }`;
                if (!onIndex) {
                  return (
                    <Link key={symbol} href={`/indices/${encodeURIComponent(symbol)}`} className={className}>
                      {symbol}
                    </Link>
                  );
                }
                return (
                  <button
                    key={symbol}
                    type="button"
                    aria-pressed={active}
                    className={className}
                    onClick={() => {
                      onIndex(symbol);
                      setOpen(false);
                    }}
                  >
                    {symbol}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
