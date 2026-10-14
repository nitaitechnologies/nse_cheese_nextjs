"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "./api";
import CopySymbol from "./CopySymbol";
import EventTable from "./EventTable";
import IndexBubbles from "./IndexBubbles";
import { money, signed, signedPct, tone } from "./format";
import { useSessionDate } from "./SessionDate";
import type { StockBoardRow } from "@/lib/types";

export default function StockCard({
  stock,
  onRemove,
}: {
  stock: StockBoardRow;
  onRemove: (token: number) => void;
}) {
  const { date } = useSessionDate();
  const [picked, setPicked] = useState(stock.picked);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPicked(stock.picked);
  }, [stock.picked]);

  async function keep() {
    setError("");
    setBusy(true);
    setPicked(true);
    try {
      await api("/api/picks", {
        method: "POST",
        body: JSON.stringify({ instrument_token: stock.instrument_token, date }),
      });
      setPending(false);
    } catch (err) {
      setPicked(false);
      setError(err instanceof Error ? err.message : "Could not store the stock");
    } finally {
      setBusy(false);
    }
  }

  async function uncheck() {
    setError("");
    setBusy(true);
    setPicked(false);
    try {
      await api("/api/picks", {
        method: "DELETE",
        body: JSON.stringify({ instrument_token: stock.instrument_token }),
      });
      setPending(false);
    } catch (err) {
      setPicked(true);
      setError(err instanceof Error ? err.message : "Could not uncheck the stock");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex h-full flex-col rounded-2xl border border-line px-3 py-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate font-medium">{stock.tradingsymbol}</p>
        <CopySymbol value={stock.tradingsymbol} />
      </div>
      <p className="truncate text-xs text-muted">{stock.name}</p>
      <p className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums leading-none ${tone(stock.change)}`}>
        {money(stock.last)}
        <span className="ml-2 text-xs font-medium">
          {signed(stock.change)} {signedPct(stock.changePct)}
        </span>
      </p>
      <EventTable events={stock.events} />
      <IndexBubbles indices={stock.indices} />
      {error ? <p className="mt-2 text-xs text-down">{error}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-2">
        <Link
          href={`/stocks/${stock.instrument_token}`}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold"
        >
          View
        </Link>
        <Link
          href={`/stocks/${stock.instrument_token}/edit`}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-gold"
        >
          Edit
        </Link>
        <label className="inline-flex min-h-11 items-center gap-2 px-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-gold"
            checked={picked}
            disabled={busy}
            onChange={(event) => {
              if (event.target.checked) {
                void keep();
                return;
              }
              setPending(true);
            }}
          />
          Picked
        </label>
        <button className="min-h-11 rounded-xl px-3 text-sm text-down" onClick={() => onRemove(stock.instrument_token)}>
          Remove
        </button>
        {pending ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm">Uncheck {stock.tradingsymbol}?</p>
            <button type="button" className="min-h-11 rounded-xl px-3 text-sm" disabled={busy} onClick={() => setPending(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="min-h-11 rounded-xl px-3 text-sm text-down"
              disabled={busy}
              onClick={() => void uncheck()}
            >
              Uncheck
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
