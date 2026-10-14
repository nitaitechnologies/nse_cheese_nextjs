"use client";

import { useState, type ReactNode } from "react";
import { latestSideEvent } from "@/lib/signals";
import type { BreakPickRow, Side } from "@/lib/types";

type Tab = "all" | Side;
type Mode = "any" | "break" | "probe";

function breakTime(stock: BreakPickRow, side: Side): number {
  return latestSideEvent(stock.events, side)?.ts ?? 0;
}

function sideMatches(stock: BreakPickRow, side: Side, mode: Mode, minStrength: number): boolean {
  if (mode === "any") return stock.events.some((event) => event.side === side);
  const latest = latestSideEvent(stock.events, side);
  if (latest?.kind !== mode) return false;
  if (mode === "break" && latest.strength < minStrength) return false;
  return true;
}

export function sideStocks(
  stocks: BreakPickRow[],
  side: Side,
  mode: Mode = "any",
  minStrength = 1,
): BreakPickRow[] {
  return stocks
    .filter((stock) => sideMatches(stock, side, mode, minStrength))
    .sort((a, b) => breakTime(b, side) - breakTime(a, side) || a.tradingsymbol.localeCompare(b.tradingsymbol));
}

function Heading({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <h2 className={`mt-3 text-sm font-medium ${tone}`}>
      {label} <span className="font-mono">{count}</span>
    </h2>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "PDH", label: "High" },
  { id: "PDL", label: "Low" },
];

function Cards({
  stocks,
  side,
  columns,
  render,
}: {
  stocks: BreakPickRow[];
  side: Side;
  columns: 1 | 2;
  render: (stock: BreakPickRow, side: Side) => ReactNode;
}) {
  return (
    <div className={columns === 2 ? "grid grid-cols-2 items-stretch gap-2" : "flex flex-col gap-2"}>
      {stocks.map((stock) => (
        <div key={`${side}-${stock.instrument_token}`} className="h-full">
          {render(stock, side)}
        </div>
      ))}
    </div>
  );
}

const DEFAULT_HEADINGS = {
  high: "High breakouts",
  low: "Low breakouts",
  emptyHigh: "No high break yet.",
  emptyLow: "No low break yet.",
};

export default function BreakGroups({
  stocks,
  render,
  extra,
  columns = 1,
  headings = DEFAULT_HEADINGS,
  mode = "any",
  minStrength = 1,
}: {
  stocks: BreakPickRow[];
  render: (stock: BreakPickRow, side: Side) => ReactNode;
  extra?: ReactNode;
  columns?: 1 | 2;
  headings?: typeof DEFAULT_HEADINGS;
  mode?: Mode;
  minStrength?: number;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const high = sideStocks(stocks, "PDH", mode, minStrength);
  const low = sideStocks(stocks, "PDL", mode, minStrength);
  const counts: Record<Tab, number> = {
    all: high.length + low.length,
    PDH: high.length,
    PDL: low.length,
  };
  return (
    <>
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${
              tab === item.id ? "border-gold bg-gold font-semibold text-ink" : "border-line text-muted"
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label} {counts[item.id]}
          </button>
        ))}
      </div>
      {tab !== "PDL" ? (
        <>
          <Heading label={headings.high} count={high.length} tone="text-up" />
          {high.length === 0 ? (
            <p className="text-sm text-muted">{headings.emptyHigh}</p>
          ) : (
            <Cards stocks={high} side="PDH" columns={columns} render={render} />
          )}
        </>
      ) : null}
      {tab !== "PDH" ? (
        <>
          <Heading label={headings.low} count={low.length} tone="text-down" />
          {low.length === 0 ? (
            <p className="text-sm text-muted">{headings.emptyLow}</p>
          ) : (
            <Cards stocks={low} side="PDL" columns={columns} render={render} />
          )}
        </>
      ) : null}
      {tab === "all" ? extra : null}
    </>
  );
}
