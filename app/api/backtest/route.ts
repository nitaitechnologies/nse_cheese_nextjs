import { NextResponse } from "next/server";
import { detectBreaks } from "@/lib/signals";
import { unauthorized } from "@/lib/guard";
import {
  deleteAbsentSignals,
  getDayCandles,
  getPreviousDaily,
  getPreviousSessionCandles,
  listStocks,
  upsertSignal,
} from "@/lib/store";
import type { SignalDoc } from "@/lib/types";

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { date?: string } | null;
  const date = body?.date ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Pick a session date" }, { status: 400 });
  }
  const stocks = await listStocks();
  const signals: SignalDoc[] = [];
  let withCandles = 0;
  for (const item of stocks) {
    const candles = await getDayCandles(item.instrument_token, date);
    if (candles.length === 0) continue;
    withCandles += 1;
    const previous = await getPreviousDaily(item.instrument_token, date);
    if (!previous) continue;
    const prior = await getPreviousSessionCandles(item.instrument_token, date);
    const breaks = detectBreaks({
      candles,
      priorCandles: prior,
      pdh: previous.high,
      pdl: previous.low,
    });
    for (const itemBreak of breaks) {
      const { doc } = await upsertSignal({
        ...itemBreak,
        instrument_token: item.instrument_token,
        tradingsymbol: item.tradingsymbol,
        date,
      });
      signals.push(doc);
    }
    await deleteAbsentSignals(
      item.instrument_token,
      date,
      breaks.map((itemBreak) => itemBreak.side),
    );
  }
  signals.sort((a, b) => a.ts - b.ts);
  return NextResponse.json({
    date,
    signals: JSON.parse(JSON.stringify(signals)) as SignalDoc[],
    scanned: stocks.length,
    withCandles,
    message:
      withCandles === 0
        ? "No stored 5-minute candles for that date. Backfill history first."
        : "",
  });
}
