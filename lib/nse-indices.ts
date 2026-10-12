import { normalizeIndexSymbol } from "./breadth";

/** Short symbols used by the NSE live equity pages and by Kite. */
export const TRACKED_INDEX_SYMBOLS = [
  "NIFTY 50",
  "NIFTY NEXT 50",
  "NIFTY BANK",
  "NIFTY FIN SERVICE",
  "NIFTY AUTO",
  "NIFTY FINSRV25 50",
  "NIFTY FMCG",
  "NIFTY IT",
  "NIFTY MEDIA",
  "NIFTY METAL",
  "NIFTY PHARMA",
  "NIFTY PSU BANK",
  "NIFTY PVT BANK",
  "NIFTY REALTY",
  "NIFTY HEALTHCARE",
  "NIFTY CONSR DURBL",
  "NIFTY OIL AND GAS",
  "NIFTY CHEMICALS",
] as const;

export type IndexConstituent = {
  tradingsymbol: string;
  name: string;
};

export type IndexBook = {
  symbol: string;
  name: string;
  stocks: IndexConstituent[];
};

type NseRow = {
  symbol?: string;
  series?: string | null;
  identifier?: string;
  companyName?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export function parseIndexBook(querySymbol: string, payload: unknown): IndexBook {
  const symbol = normalizeIndexSymbol(querySymbol);
  const rows = readRows(payload);
  if (rows.length < 2) throw new Error(`NSE returned no constituents for ${symbol}`);
  const head = rows[0];
  const name = displayName(head?.identifier || head?.symbol || symbol);
  const stocks: IndexConstituent[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row.series !== "string" || row.series.trim() === "") continue;
    const tradingsymbol = (row.symbol ?? "").trim().toUpperCase();
    if (!tradingsymbol || seen.has(tradingsymbol)) continue;
    seen.add(tradingsymbol);
    const company = (row.companyName ?? "").trim().replace(/\s+/g, " ");
    stocks.push({ tradingsymbol, name: company || tradingsymbol });
  }
  if (stocks.length === 0) throw new Error(`NSE returned no stocks for ${symbol}`);
  return { symbol, name, stocks };
}

export async function fetchTrackedConstituents(
  symbols: readonly string[] = TRACKED_INDEX_SYMBOLS,
): Promise<IndexBook[]> {
  const cookie = await nseCookie();
  const books: IndexBook[] = [];
  for (const symbol of symbols) {
    const payload = await fetchIndexPayload(symbol, cookie);
    books.push(parseIndexBook(symbol, payload));
  }
  return books;
}

function displayName(identifier: string): string {
  return identifier.replace(/\s+INDEX$/i, "").trim().replace(/\s+/g, " ");
}

function readRows(payload: unknown): NseRow[] {
  if (!payload || typeof payload !== "object") return [];
  const data = "data" in payload ? payload.data : null;
  if (!data || typeof data !== "object" || !("data" in data)) return [];
  const rows = data.data;
  return Array.isArray(rows) ? (rows as NseRow[]) : [];
}

async function nseCookie(): Promise<string> {
  const home = await fetch("https://www.nseindia.com/", {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!home.ok) throw new Error(`NSE homepage returned ${home.status}`);
  const cookie = cookieHeader(home.headers);
  if (!cookie) throw new Error("NSE did not return a session cookie");
  return cookie;
}

function cookieHeader(headers: Headers): string {
  const listed = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const parts = listed.length > 0 ? listed : headers.get("set-cookie") ? [headers.get("set-cookie") as string] : [];
  return parts.map((part) => part.split(";")[0]).filter(Boolean).join("; ");
}

async function fetchIndexPayload(symbol: string, cookie: string): Promise<unknown> {
  const url = `https://www.nseindia.com/api/NextApi/apiClient/marketWatchApi?functionName=getIndicesData&symbol=${encodeURIComponent(symbol)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.nseindia.com/market-data/live-equity-market",
      Cookie: cookie,
    },
  });
  if (!response.ok) throw new Error(`NSE ${symbol} returned ${response.status}`);
  return response.json();
}
