"use client";

import { useEffect, useState } from "react";
import type { Breadth, PieFrame, PieReplay } from "@/lib/types";
import { api, dated } from "./api";
import { clock } from "./format";
import BreadthPie, { pieBackground } from "./Pie";

const STEP_MS = 500;

function frameBreadth(pie: PieReplay, frame: PieFrame): Breadth & PieFrame {
  return {
    label: pie.label,
    symbol: pie.symbol,
    missing: false,
    ...frame,
  };
}

export default function PieReplayModal({
  date,
  symbol,
  onClose,
}: {
  date: string;
  symbol: string | null;
  onClose: () => void;
}) {
  const [pies, setPies] = useState<PieReplay[] | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let gone = false;
    const path = symbol
      ? dated(`/api/pie-history?symbol=${encodeURIComponent(symbol)}`, date)
      : dated("/api/pie-history", date);
    void api<{ pies: PieReplay[] }>(path)
      .then((body) => {
        if (gone) return;
        setPies(body.pies);
        setIndex(0);
        setPlaying(body.pies.some((pie) => pie.frames.length > 1));
      })
      .catch((err) => {
        if (!gone) setError(err instanceof Error ? err.message : "Could not load the replay");
      });
    return () => {
      gone = true;
    };
  }, [date, symbol]);

  const count = pies ? Math.min(...pies.map((pie) => pie.frames.length)) : 0;
  const frameCount = Number.isFinite(count) ? count : 0;

  useEffect(() => {
    if (!playing || frameCount < 2 || index >= frameCount - 1) return;
    const timer = window.setTimeout(() => setIndex((current) => current + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, frameCount]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!pies) return;
    document.querySelectorAll<HTMLElement>(`[data-pie-frame="${index}"]`).forEach((node) => {
      const parent = node.parentElement;
      if (!parent) return;
      parent.scrollTo({ left: node.offsetLeft - parent.clientWidth / 2 + node.clientWidth / 2, behavior: "smooth" });
    });
  }, [index, pies]);

  const title = symbol == null ? "Indices Strength" : (pies?.[0]?.label ?? "Replay");
  const time = pies?.[0]?.frames[index]?.time;

  function play() {
    setIndex((current) => (frameCount > 0 && current >= frameCount - 1 ? 0 : current));
    setPlaying(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-line bg-ink p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="mt-1 font-mono text-xs text-muted">{time ? clock(time) : "9:15 to now"}</p>
          </div>
          <div className="flex items-center gap-2">
            {frameCount > 1 ? (
              <button
                type="button"
                className="min-h-11 rounded-xl border border-line px-3 text-sm text-gold"
                onClick={() => (playing && index < frameCount - 1 ? setPlaying(false) : play())}
              >
                {playing && index < frameCount - 1 ? "Pause" : "Replay"}
              </button>
            ) : null}
            <button type="button" className="min-h-11 px-2 text-sm text-muted" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {error ? <p className="mt-4 text-sm text-down">{error}</p> : null}
        {pies == null && !error ? <p className="mt-4 text-sm text-muted">Loading the session…</p> : null}
        {pies && frameCount === 0 ? (
          <p className="mt-4 text-sm text-muted">No snapshots yet. They begin at 9:15.</p>
        ) : null}
        {pies && frameCount > 0 ? (
          <>
            <div className="mt-4 grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 [&_article]:min-w-0 [&_article]:w-full [&_article]:flex-none">
              {pies.map((pie) => {
                const frame = pie.frames[index];
                if (!frame) return null;
                return <BreadthPie key={pie.symbol ?? "market"} breadth={frameBreadth(pie, frame)} />;
              })}
            </div>
            <div className="mt-5 space-y-4">
              {pies.map((pie) => (
                <div key={pie.symbol ?? "market"}>
                  <p className="text-xs text-muted">{pie.label}</p>
                  <div className="relative mt-2 flex gap-2 overflow-x-auto pb-1">
                    {pie.frames.map((frame, frameIndex) => {
                      const card = frameBreadth(pie, frame);
                      const active = frameIndex === index;
                      return (
                        <button
                          key={frame.time}
                          type="button"
                          data-pie-frame={frameIndex}
                          aria-current={active ? "true" : undefined}
                          aria-label={`${pie.label} at ${clock(frame.time)}`}
                          className={`flex w-16 shrink-0 flex-col items-center rounded-xl border px-1 py-2 ${
                            active ? "border-gold" : "border-line"
                          }`}
                          onClick={() => {
                            setPlaying(false);
                            setIndex(frameIndex);
                          }}
                        >
                          <span
                            className="relative size-12 rounded-full"
                            style={{ background: pieBackground(card) }}
                          >
                            <span className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-ink text-[10px] leading-none">
                              <span className="text-up">{frame.advance}</span>
                              <span className="text-down">{frame.decline}</span>
                            </span>
                          </span>
                          <span className="mt-1 font-mono text-[10px] text-muted">{clock(frame.time)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
