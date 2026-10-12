import { NextResponse } from "next/server";
import { distancePct } from "@/lib/candles";
import { unauthorized } from "@/lib/guard";
import {
  dashboardBreadth,
  getKiteSession,
  listPreviousRanges,
  listQuotes,
  listSessionLastCloses,
  listSignals,
  listStocks,
  readRuntime,
} from "@/lib/store";
import { istDateString } from "@/lib/time";
import type { DashboardPayload, WatchRow } from "@/lib/types";

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  const date = istDateString(new Date());
  const [session, runtime, stocks, signals, breadth] = await Promise.all([
    getKiteSession(date),
    readRuntime(),
    listStocks(),
    listSignals(date),
    dashboardBreadth(date),
  ]);
  const tokens = stocks.map((item) => item.instrument_token);
  const quotes = await listQuotes(tokens);
  const quoted = new Map(quotes.map((row) => [row.instrument_token, row.last_price]));
  const [ranges, closes] = await Promise.all([
    listPreviousRanges(tokens, date),
    listSessionLastCloses(
      tokens.filter((token) => quoted.get(token) == null),
      date,
    ),
  ]);
  const watching: WatchRow[] = [];
  for (const item of stocks) {
    const previous = ranges.get(item.instrument_token);
    const last = quoted.get(item.instrument_token) ?? closes.get(item.instrument_token) ?? null;
    const own = signals.filter((signal) => signal.instrument_token === item.instrument_token);
    watching.push({
      instrument_token: item.instrument_token,
      tradingsymbol: item.tradingsymbol,
      name: item.name,
      last,
      pdh: previous?.high ?? null,
      pdl: previous?.low ?? null,
      distHighPct: distancePct(previous?.high ?? null, last, "high"),
      distLowPct: distancePct(previous?.low ?? null, last, "low"),
      signal: own.sort((a, b) => b.ts - a.ts)[0] ?? null,
    });
  }
  const watched = new Set(tokens);
  const payload: DashboardPayload = {
    date,
    kite: {
      connected: Boolean(session),
      userId: session?.user_id ?? null,
      userName: session?.user_name ?? null,
      loginDate: session?.login_date ?? null,
    },
    worker: {
      connected: runtime?.connected ?? false,
      lastTickAt: runtime?.lastTickAt ?? null,
      watchCount: runtime?.watchCount ?? stocks.length,
      message: runtime?.message ?? "Worker has not reported yet",
    },
    breakouts: signals
      .filter((signal) => watched.has(signal.instrument_token))
      .sort((a, b) => b.ts - a.ts),
    watching,
    breadth,
  };
  return NextResponse.json(JSON.parse(JSON.stringify(payload)) as DashboardPayload);
}
