"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clampSessionDate, istDateString } from "@/lib/time";

const STORAGE_KEY = "breakouts-session-date";

type SessionDateValue = {
  date: string;
  today: string;
  live: boolean;
  ready: boolean;
  setDate: (value: string) => void;
};

const SessionDateContext = createContext<SessionDateValue | null>(null);

export function SessionDateProvider({ children }: { children: ReactNode }) {
  const [date, setDateState] = useState(() => istDateString(new Date()));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setDateState(clampSessionDate(stored));
    setReady(true);
  }, []);

  const value = useMemo<SessionDateValue>(() => {
    const today = istDateString(new Date());
    return {
      date,
      today,
      live: date === today,
      ready,
      setDate(next: string) {
        const currentToday = istDateString(new Date());
        const chosen = clampSessionDate(next);
        if (chosen === currentToday) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, chosen);
        setDateState(chosen);
      },
    };
  }, [date, ready]);

  return <SessionDateContext.Provider value={value}>{children}</SessionDateContext.Provider>;
}

export function useSessionDate(): SessionDateValue {
  const value = useContext(SessionDateContext);
  if (!value) throw new Error("Session date is only available inside the desk");
  return value;
}

export function SessionDateField() {
  const { date, today, setDate } = useSessionDate();
  return (
    <label htmlFor="session-date" className="mt-3 block px-1">
      <span className="px-2 text-xs uppercase tracking-[0.18em] text-muted">Date</span>
      <input
        id="session-date"
        type="date"
        value={date}
        max={today}
        onChange={(event) => setDate(event.target.value)}
        className="mt-2 w-full min-h-11 rounded-xl border border-line bg-ink px-2 text-sm text-paper"
        style={{ colorScheme: "dark" }}
      />
    </label>
  );
}
