import type { EventFilter } from "@/lib/signals";
import type { BreakEvent, Side } from "@/lib/types";

const OPTIONS: { id: EventFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "break", label: "Breakouts" },
  { id: "PDH", label: "Prev high" },
  { id: "PDL", label: "Prev low" },
  { id: "none", label: "No break" },
];

export function eventText(side: Side): string {
  return side === "PDH" ? "5m break of previous day high" : "5m break of previous day low";
}

export function eventLine(event: Pick<BreakEvent, "side" | "time" | "probeTime">): string {
  if (!event.probeTime) return `${eventText(event.side)} · ${event.time} IST`;
  return event.side === "PDH"
    ? `Closed above the previous day high at ${event.probeTime}, then below at ${event.time} IST`
    : `Closed below the previous day low at ${event.probeTime}, then above at ${event.time} IST`;
}

export default function EventFilters({
  value,
  onChange,
}: {
  value: EventFilter;
  onChange: (id: EventFilter) => void;
}) {
  return (
    <div className="mt-4 flex gap-2 overflow-x-auto">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${
            value === option.id ? "border-gold bg-gold font-semibold text-ink" : "border-line text-muted"
          }`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
