export function tone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-muted";
  return value > 0 ? "text-up" : "text-down";
}

export function signed(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const body = Math.abs(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value > 0) return `+${body}`;
  if (value < 0) return `-${body}`;
  return body;
}

export function signedPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const body = `${Math.abs(value).toFixed(2)}%`;
  if (value > 0) return `+${body}`;
  if (value < 0) return `-${body}`;
  return body;
}

export function clock(time: string): string {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  if (minute === 0) return `${hour12}${suffix}`;
  return `${hour12}:${String(minute).padStart(2, "0")}${suffix}`;
}

export function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function levelText(kind: "high" | "low", distance: number | null): string {
  if (distance == null || !Number.isFinite(distance)) {
    return kind === "high" ? "PDH —" : "PDL —";
  }
  const amount = `${Math.abs(distance).toFixed(2)}%`;
  if (kind === "high") {
    return distance >= 0 ? `${amount} under PDH` : `${amount} over PDH`;
  }
  return distance >= 0 ? `${amount} over PDL` : `${amount} under PDL`;
}

export function tickAge(ts: number | null, now = Date.now()): string {
  if (ts == null) return "no ticks yet";
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}
