import Link from "next/link";
import type { ReactNode } from "react";
import CopySymbol from "./CopySymbol";
import { eventLine } from "./EventFilters";
import { money, signed, signedPct, tone } from "./format";
import type { StockBoardRow } from "@/lib/types";

export default function BreakCard({
  stock,
  children,
  openIndices = [],
  onIndex,
  copyIndex = true,
}: {
  stock: StockBoardRow;
  children: ReactNode;
  openIndices?: string[];
  onIndex?: (symbol: string) => void;
  copyIndex?: boolean;
}) {
  return (
    <article className="rounded-2xl border border-line px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <p className="break-all font-medium">{stock.tradingsymbol}</p>
            <CopySymbol value={stock.tradingsymbol} />
          </div>
          <p className="break-words text-xs text-muted">{stock.name}</p>
        </div>
        <div className="text-right">
          <p className={`font-mono ${tone(stock.change)}`}>{money(stock.last)}</p>
          <p className={`font-mono text-xs ${tone(stock.change)}`}>
            {signed(stock.change)} · {signedPct(stock.changePct)}
          </p>
        </div>
      </div>
      {stock.events.length === 0 ? (
        <p className="mt-1 text-xs text-muted">No 5-minute break of the previous high or low today.</p>
      ) : (
        stock.events.map((event) => (
          <p
            key={event.side}
            className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs ${event.side === "PDH" ? "text-up" : "text-down"}`}
          >
            {!event.probeTime && event.strength > 0 ? (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 font-mono font-semibold text-ink"
                title="Strength"
              >
                <span className="sr-only">Strength </span>
                {event.strength}
              </span>
            ) : null}
            <span>{eventLine(event)}</span>
          </p>
        ))
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {stock.indices.length === 0 ? (
          <p className="text-xs text-muted">No index linked</p>
        ) : (
          stock.indices.map((symbol) => {
            const open = openIndices.includes(symbol);
            return (
              <span key={symbol} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={open}
                  className={`min-h-9 rounded-full border px-2.5 text-xs ${
                    open ? "border-gold text-gold" : "border-line text-muted"
                  }`}
                  onClick={() => onIndex?.(symbol)}
                >
                  {symbol}
                </button>
                {copyIndex ? <CopySymbol value={symbol} /> : null}
              </span>
            );
          })
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          href={`/stocks/${stock.instrument_token}`}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold"
        >
          View
        </Link>
        {children}
      </div>
    </article>
  );
}
