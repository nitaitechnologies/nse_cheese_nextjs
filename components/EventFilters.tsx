import type { EventFilter } from "@/lib/signals";

const OPTIONS: { id: EventFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "break", label: "Breakouts" },
  { id: "PDH", label: "Prev high" },
  { id: "PDL", label: "Prev low" },
  { id: "none", label: "No break" },
];

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
