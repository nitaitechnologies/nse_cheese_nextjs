import { clock } from "./format";
import type { BreakEvent } from "@/lib/types";

export function eventLabel(event: Pick<BreakEvent, "kind" | "side">): string {
  return `${event.kind === "break" ? "Broke" : "Probed"} ${event.side}`;
}

export default function EventTable({ events }: { events: BreakEvent[] }) {
  if (events.length === 0) {
    return <p className="mt-2 text-xs text-muted">No break today</p>;
  }
  const rows = [...events].sort((a, b) => a.ts - b.ts || (a.side === "PDH" ? -1 : 1));
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-line">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((event) => {
            const tone =
              event.kind === "probe" ? "text-muted" : event.side === "PDH" ? "text-up" : "text-down";
            return (
              <tr key={`${event.side}-${event.kind}-${event.ts}`} className="border-b border-line last:border-b-0">
                <td className={`px-2 py-1 ${tone}`}>
                  <span>{eventLabel(event)}</span>
                  {event.kind === "break" && event.strength > 0 ? (
                    <span
                      className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 font-mono text-[10px] font-semibold text-ink"
                      title="Strength"
                    >
                      <span className="sr-only">Strength </span>
                      {event.strength}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-1 text-right font-mono text-muted">{clock(event.time)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
