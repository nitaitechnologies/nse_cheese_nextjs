import { addCalendarDays, istDateString } from "./time";

/** Calendar days of session data to keep, including today. */
export const RETENTION_DAYS = 15;

/** Extra daily bars kept so the oldest session still has a previous-day range. */
export const DAILY_LOOKBACK_DAYS = 10;

export function retentionCutoff(today = istDateString(new Date())): string {
  return addCalendarDays(today, -RETENTION_DAYS);
}

export function dailyRetentionCutoff(today = istDateString(new Date())): string {
  return addCalendarDays(retentionCutoff(today), -DAILY_LOOKBACK_DAYS);
}

export function clampBackfillDays(days: number): number {
  if (!Number.isFinite(days)) return RETENTION_DAYS;
  return Math.min(Math.max(1, Math.floor(days)), RETENTION_DAYS);
}
