const IST = "Asia/Kolkata";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const OPEN_MIN = 9 * 60 + 15;
const CLOSE_MIN = 15 * 60 + 30;

export function istDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function istTimeHM(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function istWeekday(date: Date): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: IST,
    weekday: "short",
  }).format(date);
  return WEEKDAYS.indexOf(label);
}

export function isWeekdayIst(date = new Date()): boolean {
  const weekday = istWeekday(date);
  return weekday >= 1 && weekday <= 5;
}

export function isMarketOpen(date = new Date()): boolean {
  if (!isWeekdayIst(date)) return false;
  const [hour, minute] = istTimeHM(date).split(":").map(Number);
  const mins = hour * 60 + minute;
  return mins >= OPEN_MIN && mins < CLOSE_MIN;
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function bucketFromClock(hour: number, minute: number): string | null {
  const mins = hour * 60 + minute;
  if (mins < OPEN_MIN || mins >= CLOSE_MIN) return null;
  const bucket = OPEN_MIN + Math.floor((mins - OPEN_MIN) / 5) * 5;
  return `${pad2(Math.floor(bucket / 60))}:${pad2(bucket % 60)}`;
}

export function bucketFromDate(date: Date): { date: string; time: string } | null {
  const [hour, minute] = istTimeHM(date).split(":").map(Number);
  const time = bucketFromClock(hour, minute);
  if (!time) return null;
  return { date: istDateString(date), time };
}

export function istTimestamp(dateStr: string, time: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MS;
  return Math.floor(utcMs / 1000);
}

/** Unix seconds shifted so a UTC chart axis prints IST wall-clock time. */
export function chartUnix(unixSeconds: number): number {
  return unixSeconds + IST_OFFSET_MS / 1000;
}

export function addCalendarDays(dateStr: string, days: number): string {
  const noon = istTimestamp(dateStr, "12:00");
  return istDateString(new Date((noon + days * 86400) * 1000));
}

export function weekdayDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    const weekday = istWeekday(new Date(istTimestamp(cursor, "12:00") * 1000));
    if (weekday >= 1 && weekday <= 5) dates.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

export function chunkDates(
  from: string,
  to: string,
  maxDays: number,
): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = from;
  while (cursor <= to) {
    let end = addCalendarDays(cursor, maxDays - 1);
    if (end > to) end = to;
    chunks.push({ from: cursor, to: end });
    cursor = addCalendarDays(end, 1);
  }
  return chunks;
}

export function istDateTime(dateStr: string, time: string): Date {
  return new Date(istTimestamp(dateStr, time) * 1000);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function clampSessionDate(value: string | null | undefined, now = new Date()): string {
  const today = istDateString(now);
  if (!value || !DATE_KEY.test(value) || value > today) return today;
  return value;
}

export function sessionDateFromRequest(request: Request): string {
  return clampSessionDate(new URL(request.url).searchParams.get("date"));
}
