/**
 * Calendar dates, safely.
 *
 * A PostgreSQL `date` column has no time and no timezone. Drizzle serialises a
 * JS `Date` for such a column with `toISOString()` — a UTC instant — and
 * Postgres then coerces that string to a calendar date, discarding the time.
 *
 * The consequence is a silent off-by-one for every timezone east of UTC:
 * local midnight on 18 August in Asia/Kolkata is `2026-08-17T18:30Z`, which
 * Postgres reads as **17 August**. A "today" filter built that way quietly
 * includes yesterday.
 *
 * Every bound compared against a `date` column therefore goes through the
 * helpers below, which anchor the intended calendar day at 12:00 UTC — a point
 * that lands on the same date in every timezone on earth (UTC-11 → UTC+14).
 *
 * Values coming back out are handed to the UI as plain `YYYY-MM-DD` strings, so
 * the browser parses them as local calendar days rather than UTC instants.
 */

/** The calendar day of `d` (in local time), anchored at 12:00 UTC. */
export function calendarDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0));
}

/** The calendar day of a value already anchored in UTC (e.g. straight from the driver). */
export function calendarDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
}

export function addCalendarDays(d: Date, days: number): Date {
  const base = calendarDay(d);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days, 12));
}

export function startOfCalendarMonth(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1, 12));
}

export function endOfCalendarMonth(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

export function addCalendarMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + months, 1, 12));
}

/** `YYYY-MM-DD` — the wire format for every date that crosses to the client. */
export function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** `YYYY-MM` bucket key, matching Postgres `to_char(col, 'YYYY-MM')`. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
