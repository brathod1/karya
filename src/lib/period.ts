import { addCalendarMonths, calendarDay, endOfCalendarMonth, startOfCalendarMonth } from "./dates";

/**
 * Choosing a stretch of time.
 *
 * Everything resolves to a pair of calendar days anchored at 12:00 UTC, because
 * that is what a Postgres `date` column can be compared against safely — see
 * lib/dates.ts. The URL carries the *intent* (a year, a financial year, a run
 * of months) rather than the resolved dates, so a link stays meaningful and
 * "this month" still means this month tomorrow.
 */

export type PeriodParams = {
  range?: string;
  year?: string;
  fy?: string;
  from?: string;
  to?: string;
};

export type ResolvedPeriod = {
  from: Date;
  to: Date;
  label: string;
  /** Echoed back into links so the picker can show what is selected. */
  params: PeriodParams;
};

export const PRESETS = ["today", "month", "last-month", "quarter", "year", "all"] as const;
export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
  today: "Today",
  month: "This month",
  "last-month": "Last month",
  quarter: "Last 3 months",
  year: "This year",
  all: "All time",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** India's financial year runs 1 April to 31 March; "FY 2025–26" starts in 2025. */
export function financialYearRange(startYear: number) {
  return {
    from: calendarDay(new Date(startYear, 3, 1)),
    to: calendarDay(new Date(startYear + 1, 2, 31)),
  };
}

export function financialYearLabel(startYear: number) {
  return `FY ${startYear}–${String(startYear + 1).slice(-2)}`;
}

/** The financial year a given day falls in. January belongs to the year before. */
export function financialYearOf(date: Date) {
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

/** Accepts `YYYY-MM` (whole month) or `YYYY-MM-DD` (exact day). */
function parseBound(value: string | undefined, edge: "start" | "end"): Date | null {
  if (!value) return null;

  const month = value.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    const year = Number(month[1]);
    const index = Number(month[2]) - 1;
    if (index < 0 || index > 11) return null;
    const anchor = new Date(year, index, 1);
    return edge === "start" ? startOfCalendarMonth(anchor) : endOfCalendarMonth(anchor);
  }

  const day = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) {
    const parsed = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    return Number.isNaN(parsed.getTime()) ? null : calendarDay(parsed);
  }

  return null;
}

function labelForBounds(from: Date, to: Date, fromRaw: string, toRaw: string): string {
  const wholeMonths = /^\d{4}-\d{2}$/.test(fromRaw) && /^\d{4}-\d{2}$/.test(toRaw);

  if (wholeMonths) {
    const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
    const fromMonth = MONTH_SHORT[from.getUTCMonth()];
    const toMonth = MONTH_SHORT[to.getUTCMonth()];

    if (sameYear && from.getUTCMonth() === to.getUTCMonth()) {
      return `${MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`;
    }
    return sameYear
      ? `${fromMonth}–${toMonth} ${from.getUTCFullYear()}`
      : `${fromMonth} ${from.getUTCFullYear()} – ${toMonth} ${to.getUTCFullYear()}`;
  }

  const day = (d: Date) => `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return from.getTime() === to.getTime() ? day(from) : `${day(from)} – ${day(to)}`;
}

export function resolvePeriod(params: PeriodParams, today = new Date()): ResolvedPeriod {
  // An explicit span wins over everything else.
  const from = parseBound(params.from, "start");
  const to = parseBound(params.to ?? params.from, "end");
  if (from && to && from <= to) {
    return { from, to, label: labelForBounds(from, to, params.from!, params.to ?? params.from!), params };
  }

  if (params.fy) {
    const startYear = Number(params.fy);
    if (Number.isInteger(startYear) && startYear > 1990 && startYear < 2200) {
      const range = financialYearRange(startYear);
      return { ...range, label: financialYearLabel(startYear), params: { fy: params.fy } };
    }
  }

  if (params.year) {
    const year = Number(params.year);
    if (Number.isInteger(year) && year > 1990 && year < 2200) {
      return {
        from: calendarDay(new Date(year, 0, 1)),
        to: calendarDay(new Date(year, 11, 31)),
        label: String(year),
        params: { year: params.year },
      };
    }
  }

  const preset = (PRESETS as readonly string[]).includes(params.range ?? "")
    ? (params.range as Preset)
    : "month";

  return { ...presetRange(preset, today), label: PRESET_LABELS[preset], params: { range: preset } };
}

export function presetRange(preset: Preset, today = new Date()): { from: Date; to: Date } {
  switch (preset) {
    case "today":
      return { from: calendarDay(today), to: calendarDay(today) };
    case "last-month": {
      const previous = addCalendarMonths(today, -1);
      return { from: startOfCalendarMonth(previous), to: endOfCalendarMonth(previous) };
    }
    case "quarter":
      return { from: startOfCalendarMonth(addCalendarMonths(today, -2)), to: endOfCalendarMonth(today) };
    case "year":
      return { from: calendarDay(new Date(today.getFullYear(), 0, 1)), to: endOfCalendarMonth(today) };
    case "all":
      return { from: calendarDay(new Date(2000, 0, 1)), to: endOfCalendarMonth(today) };
    case "month":
    default:
      return { from: startOfCalendarMonth(today), to: endOfCalendarMonth(today) };
  }
}

/** Years and financial years worth offering, newest first. */
export function selectableYears(earliest: Date | null, today = new Date()): number[] {
  const first = earliest ? earliest.getFullYear() : today.getFullYear();
  const years: number[] = [];
  for (let year = today.getFullYear(); year >= Math.min(first, today.getFullYear()); year--) years.push(year);
  return years;
}

export function selectableFinancialYears(earliest: Date | null, today = new Date()): number[] {
  const first = earliest ? financialYearOf(earliest) : financialYearOf(today);
  const current = financialYearOf(today);
  const years: number[] = [];
  for (let year = current; year >= Math.min(first, current); year--) years.push(year);
  return years;
}

/** `YYYY-MM`, the wire format for month bounds. */
export function monthKeyOf(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}
