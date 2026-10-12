import Link from "next/link";
import { eventText } from "./EventFilters";
import { money, signed, signedPct, tone } from "./format";
import type { StockBoardRow } from "@/lib/types";

export default function StockCard({
  stock,
  onRemove,
}: {
  stock: StockBoardRow;
  onRemove: (token: number) => void;
}) {
  return (
    <article className="rounded-2xl border border-line px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{stock.tradingsymbol}</p>
          <p className="text-xs text-muted">{stock.name}</p>
        </div>
        <div className="text-right">
          <p className={`font-mono ${tone(stock.change)}`}>{money(stock.last)}</p>
          <p className={`font-mono text-xs ${tone(stock.change)}`}>
            {signed(stock.change)} · {signedPct(stock.changePct)}
          </p>
        </div>
      </div>
      <p className="mt-1 font-mono text-xs text-muted">Prev close {money(stock.prevClose)}</p>
      <p className="mt-1 text-xs text-muted">
        {stock.indices.length > 0 ? stock.indices.join(" · ") : "No index linked"}
      </p>
      {stock.events.map((event) => (
        <p key={event.side} className={`mt-1 text-xs ${event.side === "PDH" ? "text-up" : "text-down"}`}>
          {eventText(event.side)} · {event.time} IST
        </p>
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          href={`/stocks/${stock.instrument_token}`}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold"
        >
          View
        </Link>
        <Link
          href={`/stocks/${stock.instrument_token}/edit`}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold"
        >
          Edit
        </Link>
        <button className="min-h-11 rounded-xl px-3 text-sm text-down" onClick={() => onRemove(stock.instrument_token)}>
          Remove
        </button>
      </div>
    </article>
  );
}
