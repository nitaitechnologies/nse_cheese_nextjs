import { NextResponse } from "next/server";
import { priceChange } from "@/lib/breadth";
import { mergeCandles } from "@/lib/candles";
import { unauthorized } from "@/lib/guard";
import { detectBreaks } from "@/lib/signals";
import {
  findInstrument,
  getDayCandles,
  getPreviousDaily,
  getPreviousSessionCandles,
  indexCardsForInstrument,
  listQuotes,
  sessionPrice,
} from "@/lib/store";
import { istDateString } from "@/lib/time";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { token: raw } = await context.params;
  const token = Number(raw);
  if (!Number.isInteger(token) || token <= 0) {
    return NextResponse.json({ error: "Unknown symbol" }, { status: 400 });
  }
  const instrument = await findInstrument(token);
  if (!instrument) {
    return NextResponse.json({ error: "Symbol is not in the instrument list" }, { status: 404 });
  }
  const requested = new URL(request.url).searchParams.get("date");
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : istDateString(new Date());
  const closed = await getDayCandles(token, date);
  const previous = await getPreviousDaily(token, date);
  const prior = await getPreviousSessionCandles(token, date);
  const signals =
    previous == null
      ? []
      : detectBreaks({
          candles: closed,
          priorCandles: prior,
          pdh: previous.high,
          pdl: previous.low,
        });
  let candles = closed;
  if (date === istDateString(new Date())) {
    const [quote] = await listQuotes([token]);
    if (quote?.forming && quote.date === date) {
      candles = mergeCandles(closed, [quote.forming]);
    }
  }
  const indices = await indexCardsForInstrument(token, date);
  const quote = await sessionPrice(token, date);
  const last = quote.last ?? candles.at(-1)?.close ?? null;
  return NextResponse.json({
    instrument_token: token,
    tradingsymbol: instrument.tradingsymbol,
    name: instrument.name,
    date,
    pdh: previous?.high ?? null,
    pdl: previous?.low ?? null,
    last,
    prevClose: quote.prevClose,
    ...priceChange(last, quote.prevClose),
    candles,
    signals,
    indices,
  });
}
