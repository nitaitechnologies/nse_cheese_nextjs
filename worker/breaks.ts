import { detectBreaks } from "../lib/signals";
import {
  claimNotice,
  deleteAbsentSignals,
  getSettings,
  markStockNotified,
  stockAlreadyNotified,
  upsertSignal,
} from "../lib/store";
import type { Candle, SignalDoc } from "../lib/types";
import { pushBreakout } from "./notify";
import { broadcast } from "./stream";

async function alertOnce(doc: SignalDoc, muted: boolean): Promise<boolean> {
  if (await stockAlreadyNotified(doc.instrument_token, doc.date)) {
    await markStockNotified(doc.instrument_token, doc.date);
    return false;
  }
  const claimed = await claimNotice(`breakout-${doc.date}-${doc.instrument_token}`);
  if (!claimed) {
    await markStockNotified(doc.instrument_token, doc.date);
    return false;
  }
  try {
    if (muted) return false;
    return await pushBreakout(doc);
  } catch (error) {
    console.error(`[worker] pushover failed for ${doc.tradingsymbol}; not retrying today`, error);
    return false;
  } finally {
    await markStockNotified(doc.instrument_token, doc.date);
  }
}

export async function persistBreaks(input: {
  instrumentToken: number;
  tradingsymbol: string;
  date: string;
  candles: Candle[];
  priorCandles: Candle[];
  pdh: number | null;
  pdl: number | null;
  allowNotify: boolean;
  replace: boolean;
}): Promise<void> {
  if (input.pdh == null || input.pdl == null) return;
  const breaks = detectBreaks({
    candles: input.candles,
    priorCandles: input.priorCandles,
    pdh: input.pdh,
    pdl: input.pdl,
  });
  const settings = await getSettings();
  for (const item of breaks) {
    const { doc, inserted } = await upsertSignal({
      ...item,
      instrument_token: input.instrumentToken,
      tradingsymbol: input.tradingsymbol,
      date: input.date,
    });
    let announced = inserted;
    if (
      input.allowNotify &&
      !doc.notified &&
      doc.strength >= settings.minStrength
    ) {
      if (await alertOnce(doc, settings.pushoverMutedDate === input.date)) announced = true;
    }
    if (announced) broadcast("breakout", doc);
  }
  if (input.replace) {
    await deleteAbsentSignals(
      input.instrumentToken,
      input.date,
      breaks.map((item) => item.side),
    );
  }
}
