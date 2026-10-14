"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, dated, endSession } from "./api";
import { SessionDateField, SessionDateProvider, useSessionDate } from "./SessionDate";
import type { DeskCounts } from "@/lib/types";

const links: { href: string; label: string; count?: keyof DeskCounts }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/breaks", label: "Breaks", count: "breaks" },
  { href: "/probes", label: "Probed", count: "probes" },
  { href: "/picks", label: "Picked", count: "picks" },
  { href: "/indices", label: "Indices", count: "indices" },
  { href: "/stocks", label: "Stocks", count: "stocks" },
  { href: "/settings", label: "Setup" },
];

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <SessionDateProvider>
      <ShellFrame>{children}</ShellFrame>
    </SessionDateProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide =
    pathname === "/" ||
    pathname.startsWith("/breaks") ||
    pathname.startsWith("/probes") ||
    pathname.startsWith("/picks") ||
    pathname === "/stocks";
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [counts, setCounts] = useState<DeskCounts | null>(null);
  const { date, ready } = useSessionDate();

  useEffect(() => {
    if (!ready) return;
    let gone = false;
    async function load() {
      try {
        const body = await api<DeskCounts>(dated("/api/counts", date));
        if (!gone) setCounts(body);
      } catch {
        // Keep the last counts if a refresh fails.
      }
    }
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    const poll = window.setInterval(() => {
      void load();
    }, 10000);
    return () => {
      gone = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [date, ready]);

  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await endSession();
    } catch (err) {
      setLoggingOut(false);
      setLogoutError(err instanceof Error ? err.message : "Could not log out");
    }
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 z-20 flex h-dvh w-48 shrink-0 flex-col border-r border-line bg-panel px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
        <p className="px-2 text-xs uppercase tracking-[0.18em] text-muted">Breakouts</p>
        <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-sm font-medium ${
                  active ? "bg-panel-2 text-gold" : "text-muted"
                }`}
              >
                <span>{link.label}</span>
                {link.count && counts ? (
                  <span className="font-mono text-xs tabular-nums">{counts[link.count]}</span>
                ) : null}
              </Link>
            );
          })}
          <SessionDateField />
        </nav>
        {logoutError ? <p className="mb-2 px-2 text-xs text-down">{logoutError}</p> : null}
        <button
          type="button"
          className="mb-3 flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium text-down disabled:opacity-60"
          disabled={loggingOut}
          onClick={() => void logout()}
        >
          {loggingOut ? "Signing out…" : "Log out"}
        </button>
      </aside>
      <div className="min-w-0 flex-1">
        <div className={`mx-auto min-h-dvh w-full ${wide ? "max-w-7xl" : "max-w-5xl"}`}>{children}</div>
      </div>
    </div>
  );
}
