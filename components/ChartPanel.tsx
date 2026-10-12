"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, LineStyle, SeriesMarker, UTCTimestamp } from "lightweight-charts";
import { api } from "./api";
import { money } from "./format";
import BreadthPie from "./Pie";
import type { Candle, IndexCard, Side } from "@/lib/types";

type ChartPayload = {
  instrument_token: number;
  tradingsymbol: string;
  name: string;
  date: string;
  pdh: number | null;
  pdl: number | null;
  candles: Candle[];
  signals: Array<{ time: string; ts: number; side: Side; strength: number }>;
  indices: IndexCard[];
};

type MarkerApi = { setMarkers: (markers: SeriesMarker<UTCTimestamp>[]) => void };

export default function ChartPanel({
  token,
  date,
  backHref,
}: {
  token: string;
  date: string;
  backHref?: string;
}) {
  const [payload, setPayload] = useState<ChartPayload | null>(null);
  const [indices, setIndices] = useState<IndexCard[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<MarkerApi | null>(null);
  const pdhRef = useRef<IPriceLine | null>(null);
  const pdlRef = useRef<IPriceLine | null>(null);
  const fitted = useRef(false);
  const dashed = useRef<LineStyle>(2 as LineStyle);

  useEffect(() => {
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    const timer = window.setTimeout(() => {
      void api<ChartPayload>(`/api/candles/${token}${query}`)
        .then((body) => {
          setPayload(body);
          setIndices(body.indices);
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Chart failed"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token, date]);

  useEffect(() => {
    const sessionDate = payload?.date;
    if (!sessionDate || date) return;
    const source = new EventSource("/api/stream");
    source.addEventListener("candle", (event) => {
      const message = JSON.parse((event as MessageEvent).data) as {
        instrument_token: number;
        date: string;
        candle: Candle;
      };
      if (String(message.instrument_token) !== token || message.date !== sessionDate) return;
      setPayload((current) => {
        if (!current) return current;
        const candles = current.candles.filter((candle) => candle.time !== message.candle.time);
        candles.push(message.candle);
        candles.sort((a, b) => a.ts - b.ts);
        return { ...current, candles };
      });
    });
    source.addEventListener("breakout", () => {
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      void api<ChartPayload>(`/api/candles/${token}${query}`)
        .then((body) => {
          setPayload(body);
          setIndices(body.indices);
        })
        .catch(() => undefined);
    });
    return () => source.close();
  }, [payload?.date, token, date]);

  useEffect(() => {
    if (date) return;
    const timer = window.setInterval(() => {
      void api<{ indices: IndexCard[] }>(`/api/breadth?token=${encodeURIComponent(token)}`)
        .then((body) => setIndices(body.indices))
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [token, date]);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    let removed = false;
    fitted.current = false;
    void import("lightweight-charts").then((lib) => {
      if (removed || !box.current) return;
      const chart = lib.createChart(box.current, {
        autoSize: true,
        layout: {
          background: { type: lib.ColorType.Solid, color: "#12160f" },
          textColor: "#93a18c",
        },
        grid: {
          vertLines: { color: "#243024" },
          horzLines: { color: "#243024" },
        },
        rightPriceScale: { borderColor: "#31402c" },
        timeScale: { borderColor: "#31402c", timeVisible: true, secondsVisible: false },
      });
      const candles = chart.addSeries(lib.CandlestickSeries, {
        upColor: "#7dffa1",
        downColor: "#ff8d84",
        borderVisible: false,
        wickUpColor: "#7dffa1",
        wickDownColor: "#ff8d84",
      });
      const volume = chart.addSeries(lib.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
      chartRef.current = chart;
      candleRef.current = candles;
      volumeRef.current = volume;
      markersRef.current = lib.createSeriesMarkers(candles, []);
      dashed.current = lib.LineStyle.Dashed;
      setReady(true);
    });
    return () => {
      removed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      markersRef.current = null;
      pdhRef.current = null;
      pdlRef.current = null;
      setReady(false);
    };
  }, [token]);

  useEffect(() => {
    const series = candleRef.current;
    const volume = volumeRef.current;
    if (!ready || !payload || !series || !volume) return;
    series.setData(
      payload.candles.map((candle) => ({
        time: candle.ts as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );
    volume.setData(
      payload.candles.map((candle) => ({
        time: candle.ts as UTCTimestamp,
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(125,255,161,0.45)" : "rgba(255,141,132,0.45)",
      })),
    );
    if (pdhRef.current) series.removePriceLine(pdhRef.current);
    if (pdlRef.current) series.removePriceLine(pdlRef.current);
    pdhRef.current = null;
    pdlRef.current = null;
    if (payload.pdh != null) {
      pdhRef.current = series.createPriceLine({
        price: payload.pdh,
        color: "#7dffa1",
        lineStyle: dashed.current,
        title: "PDH",
      });
    }
    if (payload.pdl != null) {
      pdlRef.current = series.createPriceLine({
        price: payload.pdl,
        color: "#ff8d84",
        lineStyle: dashed.current,
        title: "PDL",
      });
    }
    markersRef.current?.setMarkers(
      payload.signals.map((signal) => ({
        time: signal.ts as UTCTimestamp,
        position: signal.side === "PDH" ? "aboveBar" : "belowBar",
        color: signal.side === "PDH" ? "#e6c27a" : "#ff8d84",
        shape: signal.side === "PDH" ? "arrowUp" : "arrowDown",
        text: `${signal.side} ${signal.strength}`,
      })),
    );
    if (!fitted.current && payload.candles.length > 0) {
      chartRef.current?.timeScale().fitContent();
      fitted.current = true;
    }
  }, [ready, payload]);

  return (
    <main className="flex min-h-dvh flex-col px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <Link href={backHref ?? (date ? "/backtest" : "/")} className="min-h-11 rounded-xl px-2 py-2 text-gold">
          Back
        </Link>
        <div className="text-right">
          <h1 className="text-lg font-semibold">{payload?.tradingsymbol ?? "Chart"}</h1>
          <p className="text-xs text-muted">
            {payload
              ? `${payload.name} · ${payload.date} · PDH ${money(payload.pdh)} · PDL ${money(payload.pdl)}`
              : "Loading"}
          </p>
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-down">{error}</p> : null}
      <section className="mt-3">
        <h2 className="text-xs uppercase tracking-[0.16em] text-muted">Indices</h2>
        {indices.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Link this stock to an index to see its advance / decline.</p>
        ) : (
          <div className="mt-2 flex gap-3 overflow-x-auto">
            {indices.map((card) => (
              <div key={card.symbol ?? card.label} className="min-w-44">
                <BreadthPie breadth={card} />
              </div>
            ))}
          </div>
        )}
      </section>
      <div ref={box} className="mt-3 min-h-[58dvh] w-full flex-1" />
    </main>
  );
}
