import { normalizeIndexSymbol } from "./breadth";

/** Short symbols used by the NSE constituent files and by Kite. */
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

const ARCHIVE = "https://nsearchives.nseindia.com/content/indices";

/** Filenames published by NSE Indices. The chemicals file keeps its mixed-case name. */
const INDEX_FILES: Record<(typeof TRACKED_INDEX_SYMBOLS)[number], string> = {
  "NIFTY 50": "ind_nifty50list.csv",
  "NIFTY NEXT 50": "ind_niftynext50list.csv",
  "NIFTY BANK": "ind_niftybanklist.csv",
  "NIFTY FIN SERVICE": "ind_niftyfinancelist.csv",
  "NIFTY AUTO": "ind_niftyautolist.csv",
  "NIFTY FINSRV25 50": "ind_niftyfinancialservices25_50list.csv",
  "NIFTY FMCG": "ind_niftyfmcglist.csv",
  "NIFTY IT": "ind_niftyitlist.csv",
  "NIFTY MEDIA": "ind_niftymedialist.csv",
  "NIFTY METAL": "ind_niftymetallist.csv",
  "NIFTY PHARMA": "ind_niftypharmalist.csv",
  "NIFTY PSU BANK": "ind_niftypsubanklist.csv",
  "NIFTY PVT BANK": "ind_nifty_privatebanklist.csv",
  "NIFTY REALTY": "ind_niftyrealtylist.csv",
  "NIFTY HEALTHCARE": "ind_niftyhealthcarelist.csv",
  "NIFTY CONSR DURBL": "ind_niftyconsumerdurableslist.csv",
  "NIFTY OIL AND GAS": "ind_niftyoilgaslist.csv",
  "NIFTY CHEMICALS": "ind_niftyChemicals_list.csv",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export function parseConstituentCsv(querySymbol: string, csv: string): IndexBook {
  const symbol = normalizeIndexSymbol(querySymbol);
  const lines = csv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length < 2) throw new Error(`NSE returned no constituents for ${symbol}`);
  const header = splitCsv(lines[0]).map((cell) => cell.trim().toLowerCase());
  const symbolAt = header.indexOf("symbol");
  const nameAt = header.indexOf("company name");
  const seriesAt = header.indexOf("series");
  if (symbolAt < 0) throw new Error(`NSE constituent file for ${symbol} has no symbol column`);
  const stocks: IndexConstituent[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const series = seriesAt >= 0 ? (cells[seriesAt] ?? "").trim() : "EQ";
    if (series === "") continue;
    const tradingsymbol = (cells[symbolAt] ?? "").trim().toUpperCase();
    if (!tradingsymbol || seen.has(tradingsymbol)) continue;
    seen.add(tradingsymbol);
    const company = (nameAt >= 0 ? (cells[nameAt] ?? "") : "").trim().replace(/\s+/g, " ");
    stocks.push({ tradingsymbol, name: company || tradingsymbol });
  }
  if (stocks.length === 0) throw new Error(`NSE returned no stocks for ${symbol}`);
  return { symbol, name: symbol, stocks };
}

export async function fetchTrackedConstituents(
  symbols: readonly string[] = TRACKED_INDEX_SYMBOLS,
): Promise<IndexBook[]> {
  return Promise.all(symbols.map((symbol) => fetchIndexBook(symbol)));
}

function constituentFile(symbol: string): string {
  const file = INDEX_FILES[symbol as (typeof TRACKED_INDEX_SYMBOLS)[number]];
  if (!file) throw new Error(`No constituent file for ${symbol}`);
  return file;
}

async function fetchIndexBook(symbol: string): Promise<IndexBook> {
  const file = constituentFile(normalizeIndexSymbol(symbol));
  const response = await fetch(`${ARCHIVE}/${file}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/csv,text/plain,*/*",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`NSE ${symbol} returned ${response.status}`);
  const csv = await response.text();
  if (csv.trimStart().startsWith("<")) {
    throw new Error(`NSE ${symbol} returned a page instead of constituents`);
  }
  return parseConstituentCsv(symbol, csv);
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}
