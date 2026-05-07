/**
 * Date helpers for the Carestino app timezone.
 *
 * "Today" / "this month" / etc. always means the current day in the store's
 * timezone (America/Argentina/Cordoba), NOT in UTC. Cordoba does not observe
 * DST (G-001), so the offset is a constant -3 — but we still pipe through
 * date-fns-tz to keep the code explicit and DST-safe if Argentina ever
 * adopts it again.
 *
 * Returned ranges are half-open: [start, end). A query for a single day
 * uses `WHERE sale_date >= start AND sale_date < end`.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const APP_TZ = 'America/Argentina/Cordoba';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject dates like 2026-02-30 by round-tripping through Date.
  const tentative = new Date(Date.UTC(y, m - 1, d));
  return (
    tentative.getUTCFullYear() === y &&
    tentative.getUTCMonth() === m - 1 &&
    tentative.getUTCDate() === d
  );
}

/** YYYY-MM-DD for "today" interpreted in APP_TZ. */
export function todayInAppTZ(now: Date = new Date()): string {
  return formatInTimeZone(now, APP_TZ, 'yyyy-MM-dd');
}

/**
 * Half-open UTC range for the calendar day `dateStr` (YYYY-MM-DD)
 * interpreted in APP_TZ.
 *
 *   const { start, end } = dayRangeInAppTZ('2026-05-07');
 *   // start = 2026-05-07T03:00:00Z (Cordoba 00:00)
 *   // end   = 2026-05-08T03:00:00Z (Cordoba next 00:00)
 */
export function dayRangeInAppTZ(dateStr: string): { start: Date; end: Date } {
  if (!isValidDateString(dateStr)) {
    throw new Error(`invalid date string: ${dateStr}`);
  }
  // `fromZonedTime` interprets the wall-clock string as APP_TZ time and
  // returns the corresponding UTC instant.
  const start = fromZonedTime(`${dateStr}T00:00:00.000`, APP_TZ);
  // For the end of day, advance one calendar day in APP_TZ.
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = formatInTimeZone(next, 'UTC', 'yyyy-MM-dd');
  const end = fromZonedTime(`${nextStr}T00:00:00.000`, APP_TZ);
  return { start, end };
}

/** Format a UTC instant as HH:mm in APP_TZ (e.g. "14:23"). */
export function formatTimeInAppTZ(date: Date): string {
  return formatInTimeZone(date, APP_TZ, 'HH:mm');
}

/** Format a UTC instant as YYYY-MM-DD in APP_TZ. */
export function formatDateInAppTZ(date: Date): string {
  return formatInTimeZone(date, APP_TZ, 'yyyy-MM-dd');
}

/** Long Spanish-friendly date e.g. "jueves 7 de mayo de 2026". */
export function formatLongDateInAppTZ(dateStr: string): string {
  if (!isValidDateString(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  // Build at noon UTC to avoid TZ drift over month boundaries.
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  // Use Intl directly — date-fns locales would add a dep we don't need.
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: APP_TZ,
  }).format(noon);
}
