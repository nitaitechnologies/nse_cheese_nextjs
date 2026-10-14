import { money, signed, signedPct, tone } from "./format";
import type { Breadth, IndexCard } from "@/lib/types";

type PieModel = Breadth & Partial<Pick<IndexCard, "last" | "prevClose" | "change" | "changePct">>;

const SLICES = [
  { key: "advance", color: "#7dffa1" },
  { key: "decline", color: "#ff8d84" },
  { key: "unchanged", color: "#e6c27a" },
  { key: "unpriced", color: "#5c6b56" },
] as const;

export function pieBackground(breadth: Breadth): string {
  if (breadth.total === 0) return "conic-gradient(#31402c 0% 100%)";
  let cursor = 0;
  const stops = SLICES.flatMap((slice) => {
    const value = breadth[slice.key];
    if (value <= 0) return [];
    const start = (cursor / breadth.total) * 100;
    cursor += value;
    const end = (cursor / breadth.total) * 100;
    return [`${slice.color} ${start}% ${end}%`];
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function caption(breadth: Breadth): string {
  if (breadth.missing) return "Create this index to fill the pie";
  if (breadth.total === 0) return "No stocks yet";
  const bits = [`${breadth.total} stocks`];
  if (breadth.unchanged > 0) bits.push(`${breadth.unchanged} flat`);
  if (breadth.unpriced > 0) bits.push(`${breadth.unpriced} no price`);
  return bits.join(" · ");
}

function hasQuote(breadth: PieModel): boolean {
  return breadth.last != null || breadth.prevClose != null;
}

export default function BreadthPie({
  breadth,
  onRemove,
  onReplay,
}: {
  breadth: PieModel;
  onRemove?: () => void;
  onReplay?: () => void;
}) {
  const label = [
    breadth.label,
    `${breadth.advance} advancing`,
    `${breadth.decline} declining`,
    `${breadth.unchanged} unchanged`,
    `${breadth.unpriced} without a price`,
  ].join(", ");
  return (
    <article className="relative flex min-w-40 flex-1 flex-col items-center rounded-2xl border border-line bg-panel px-3 py-4">
      {onReplay ? (
        <button
          type="button"
          aria-label={`Replay ${breadth.label}`}
          className="absolute inset-0 z-0 rounded-2xl"
          onClick={onReplay}
        />
      ) : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${breadth.label}`}
          className="absolute right-2 top-2 z-10 min-h-8 rounded-lg px-2 text-xs text-muted"
          onClick={onRemove}
        >
          Remove
        </button>
      ) : null}
      <div className={`flex w-full flex-col items-center ${onReplay ? "pointer-events-none relative z-0" : ""}`}>
      <h3 className={`text-center text-sm font-medium break-words ${onRemove ? "px-10" : ""}`}>{breadth.label}</h3>
      {breadth.symbol && breadth.symbol !== breadth.label ? (
        <p className="text-xs text-muted">{breadth.symbol}</p>
      ) : null}
      {hasQuote(breadth) ? (
        <div className="mt-1 text-center">
          <p className={`font-mono text-sm ${tone(breadth.change)}`}>{money(breadth.last)}</p>
          <p className={`font-mono text-xs ${tone(breadth.change)}`}>
            {signed(breadth.change)} · {signedPct(breadth.changePct)}
          </p>
          <p className="font-mono text-xs text-muted">Prev {money(breadth.prevClose)}</p>
        </div>
      ) : null}
      <div
        className="relative mt-3 size-28 rounded-full"
        style={{ background: pieBackground(breadth) }}
        role="img"
        aria-label={label}
      >
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-ink text-center leading-tight">
          <span className="font-mono text-sm text-up">{breadth.advance}</span>
          <span className="font-mono text-sm text-down">{breadth.decline}</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">{caption(breadth)}</p>
      {onReplay ? <p className="mt-2 text-xs text-gold">Replay</p> : null}
      </div>
    </article>
  );
}
