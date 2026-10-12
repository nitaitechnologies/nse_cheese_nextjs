"use client";

import { useRef, useState } from "react";
import { api } from "./api";

export function usePiePicks() {
  const [openIndices, setOpenIndices] = useState<string[]>([]);
  const desired = useRef<string[]>([]);
  const epoch = useRef(0);
  const pending = useRef(0);
  const chain = useRef(Promise.resolve());

  function stamp() {
    return { epoch: epoch.current, busy: pending.current };
  }

  function accept(pies: string[], seen: { epoch: number; busy: number }) {
    if (seen.busy > 0 || pending.current > 0 || seen.epoch !== epoch.current) return;
    if (desired.current.length === pies.length && desired.current.every((symbol, index) => symbol === pies[index])) {
      return;
    }
    desired.current = pies;
    setOpenIndices(pies);
  }

  function toggle(symbol: string) {
    epoch.current += 1;
    const shouldOpen = !desired.current.includes(symbol);
    desired.current = shouldOpen
      ? [...desired.current, symbol]
      : desired.current.filter((item) => item !== symbol);
    setOpenIndices(desired.current);
    pending.current += 1;
    const run = chain.current.then(async () => {
      try {
        await api("/api/pies", {
          method: shouldOpen ? "POST" : "DELETE",
          body: JSON.stringify({ symbol }),
        });
      } catch (err) {
        if (desired.current.includes(symbol) === shouldOpen) {
          desired.current = shouldOpen
            ? desired.current.filter((item) => item !== symbol)
            : [...desired.current, symbol];
          setOpenIndices(desired.current);
          throw err;
        }
      } finally {
        pending.current -= 1;
      }
    });
    chain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return { openIndices, stamp, accept, toggle };
}
