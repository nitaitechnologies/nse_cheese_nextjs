import type { IndexBook } from "../lib/nse-indices";
import { fetchTrackedConstituents } from "../lib/nse-indices";
import {
  listEquityInstruments,
  listIndexInstruments,
  replaceIndexMemberships,
  type IndexMembership,
} from "../lib/store";
import { syncInstruments } from "./history";

export type ConstituentSync = {
  indices: number;
  stocks: number;
  links: number;
  missing: { index: string; tradingsymbol: string }[];
};

export async function syncConstituents(): Promise<ConstituentSync> {
  const books = await fetchTrackedConstituents();
  const symbols = new Set(books.flatMap((book) => book.stocks.map((stock) => stock.tradingsymbol)));
  await syncInstruments(symbols);
  const [instruments, indexes] = await Promise.all([
    listEquityInstruments(),
    listIndexInstruments(),
  ]);
  const bySymbol = new Map(
    instruments.map((instrument) => [instrument.tradingsymbol.toUpperCase(), instrument]),
  );
  const indexBySymbol = new Map(
    indexes.map((instrument) => [instrument.tradingsymbol.toUpperCase(), instrument]),
  );
  const missing: ConstituentSync["missing"] = [];
  const memberships: IndexMembership[] = books.map((book) => ({
    symbol: book.symbol,
    name: book.name,
    instrument_token: indexBySymbol.get(book.symbol.toUpperCase())?.instrument_token ?? null,
    members: matchBook(book, bySymbol, missing),
  }));
  for (const book of memberships) {
    if (book.instrument_token == null) {
      console.error(`[worker] no Kite instrument for index ${book.symbol}`);
    }
  }
  const empty = memberships.find((book) => book.members.length === 0);
  if (empty) throw new Error(`No Kite instruments matched ${empty.symbol}`);
  const stored = await replaceIndexMemberships(memberships);
  return { ...stored, missing };
}

function matchBook(
  book: IndexBook,
  bySymbol: Map<string, { instrument_token: number; tradingsymbol: string; name: string }>,
  missing: ConstituentSync["missing"],
): IndexMembership["members"] {
  const members: IndexMembership["members"] = [];
  const seen = new Set<number>();
  for (const stock of book.stocks) {
    const instrument = bySymbol.get(stock.tradingsymbol);
    if (!instrument) {
      missing.push({ index: book.symbol, tradingsymbol: stock.tradingsymbol });
      continue;
    }
    if (seen.has(instrument.instrument_token)) continue;
    seen.add(instrument.instrument_token);
    members.push({
      instrument_token: instrument.instrument_token,
      tradingsymbol: instrument.tradingsymbol,
      name: instrument.name || stock.name,
    });
  }
  return members;
}
