import type { Breadth, Move } from "./types";

export function normalizeIndexSymbol(input: string): string {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

export function routeIndexSymbol(input: string): string {
  let value = input;
  for (let pass = 0; pass < 2; pass += 1) {
    if (!value.includes("%")) break;
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return normalizeIndexSymbol(value);
}

export function isIndexSymbol(symbol: string): boolean {
  return /^[A-Z0-9][A-Z0-9 .&-]{0,31}$/.test(symbol);
}

export type BreadthSlot = "nifty50" | "banknifty";

export function breadthSlot(symbol: string): BreadthSlot | null {
  const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key === "BANKNIFTY" || key === "NIFTYBANK") return "banknifty";
  if (key === "NIFTY50" || key === "NIFTY") return "nifty50";
  return null;
}

export function pickIndex<T extends { symbol: string }>(rows: T[], slot: BreadthSlot): T | null {
  const matches = rows.filter((row) => breadthSlot(row.symbol) === slot);
  matches.sort((a, b) => specificity(b.symbol) - specificity(a.symbol));
  return matches[0] ?? null;
}

function specificity(symbol: string): number {
  return symbol.replace(/[^A-Z0-9]/g, "") === "NIFTY" ? 1 : 2;
}

export function priceChange(
  last: number | null,
  previous: number | null,
): { change: number | null; changePct: number | null } {
  if (
    last == null ||
    previous == null ||
    !Number.isFinite(last) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return { change: null, changePct: null };
  }
  const change = last - previous;
  return { change, changePct: (change / previous) * 100 };
}

export function classifyMove(last: number | null, previous: number | null): Move {
  if (last == null || previous == null || !Number.isFinite(last) || !Number.isFinite(previous)) {
    return "unpriced";
  }
  if (last > previous) return "advance";
  if (last < previous) return "decline";
  return "unchanged";
}

export function tally(moves: Move[]): Pick<Breadth, "advance" | "decline" | "unchanged" | "unpriced" | "total"> {
  const counts = { advance: 0, decline: 0, unchanged: 0, unpriced: 0, total: moves.length };
  for (const move of moves) counts[move] += 1;
  return counts;
}
