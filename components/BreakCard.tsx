import Link from "next/link";
import type { ReactNode } from "react";
import CopySymbol from "./CopySymbol";
import EventTable from "./EventTable";
import IndexBubbles from "./IndexBubbles";
import { money, signed, signedPct, tone } from "./format";
import type { Side, StockBoardRow } from "@/lib/types";

export default function BreakCard({
  stock,
  children,
  side,
  openIndices = [],
  onIndex,
}: {
  stock: StockBoardRow;
  children: ReactNode;
  side?: Side;
  openIndices?: string[];
  onIndex?: (symbol: string) => void;
}) {
  const events = side ? stock.events.filter((event) => event.side === side) : stock.events;
  return (
    <article className="flex h-full flex-col rounded-2xl border border-line px-3 py-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate font-medium">{stock.tradingsymbol}</p>
        <CopySymbol value={stock.tradingsymbol} />
      </div>
      <p className="truncate text-xs text-muted">{stock.name}</p>
      <p className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums leading-none ${tone(stock.change)}`}>
        {money(stock.last)}
        <span className="ml-2 text-xs font-medium">
          {signed(stock.change)} {signedPct(stock.changePct)}
        </span>
      </p>
      <EventTable events={events} />
      <IndexBubbles indices={stock.indices} openIndices={openIndices} onIndex={onIndex} />
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-2">
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
