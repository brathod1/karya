import { beforeAll, describe, expect, it } from "vitest";
import {
  addCalendarDays, addCalendarMonths, calendarDay, endOfCalendarMonth,
  isoDate, monthKey, startOfCalendarMonth,
} from "./dates";

/**
 * The property that matters: whatever we send to a `date` column must serialise
 * to the calendar date we meant. Postgres reads `toISOString()` and throws the
 * time away, so this is the only thing worth asserting.
 */
const sent = (d: Date) => d.toISOString().slice(0, 10);

describe("calendar bounds survive the trip to a Postgres date column", () => {
  beforeAll(() => { process.env.TZ = "Asia/Kolkata"; });

  it("keeps today as today in a UTC+5:30 timezone", () => {
    // Local midnight in IST is the previous day in UTC — the exact bug this guards.
    const localMidnight = new Date(2026, 7, 18, 0, 0, 0);
    expect(sent(localMidnight)).toBe("2026-08-17");   // what the naive version sent
    expect(sent(calendarDay(localMidnight))).toBe("2026-08-18"); // what we send now
  });

  it("is stable across every hour of a local day", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(sent(calendarDay(new Date(2026, 7, 18, hour, 30)))).toBe("2026-08-18");
    }
  });

  it("handles month and year boundaries", () => {
    expect(sent(calendarDay(new Date(2026, 0, 1, 0, 5)))).toBe("2026-01-01");
    expect(sent(calendarDay(new Date(2025, 11, 31, 23, 55)))).toBe("2025-12-31");
  });

  it("moves whole calendar days", () => {
    const today = new Date(2026, 7, 18, 9, 0);
    expect(sent(addCalendarDays(today, -1))).toBe("2026-08-17");
    expect(sent(addCalendarDays(today, 1))).toBe("2026-08-19");
    expect(sent(addCalendarDays(new Date(2026, 2, 1, 9, 0), -1))).toBe("2026-02-28");
  });

  it("brackets a month correctly, including February", () => {
    const mid = new Date(2026, 7, 18, 15, 0);
    expect(sent(startOfCalendarMonth(mid))).toBe("2026-08-01");
    expect(sent(endOfCalendarMonth(mid))).toBe("2026-08-31");
    expect(sent(endOfCalendarMonth(new Date(2024, 1, 10)))).toBe("2024-02-29"); // leap year
    expect(sent(endOfCalendarMonth(new Date(2026, 1, 10)))).toBe("2026-02-28");
  });

  it("steps months without drifting", () => {
    const mid = new Date(2026, 7, 18, 15, 0);
    expect(sent(addCalendarMonths(mid, -1))).toBe("2026-07-01");
    expect(sent(addCalendarMonths(mid, -8))).toBe("2025-12-01");
  });

  it("emits YYYY-MM-DD for the wire, and matching month keys", () => {
    expect(isoDate(calendarDay(new Date(2026, 7, 18, 23, 59)))).toBe("2026-08-18");
    expect(isoDate(null)).toBeNull();
    expect(monthKey(calendarDay(new Date(2026, 7, 18)))).toBe("2026-08");
  });
});
