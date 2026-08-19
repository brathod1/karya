import { describe, expect, it } from "vitest";
import { parseSheetAmount, parseSheetDate, parseSheetQuantity } from "./import-parse";

const day = (d: Date) => d.toISOString().slice(0, 10);

describe("dates as they actually appear in an Indian spreadsheet", () => {
  it("reads dd/mm/yyyy as day-first, not month-first", () => {
    expect(day(parseSheetDate("18/08/2026"))).toBe("2026-08-18");
    expect(day(parseSheetDate("05/03/2026"))).toBe("2026-03-05"); // 5 March, not 3 May
    expect(day(parseSheetDate("18-08-2026"))).toBe("2026-08-18");
    expect(day(parseSheetDate("18.08.2026"))).toBe("2026-08-18");
  });

  it("reads two-digit years and ISO dates", () => {
    expect(day(parseSheetDate("18/08/26"))).toBe("2026-08-18");
    expect(day(parseSheetDate("2026-08-18"))).toBe("2026-08-18");
  });

  it("keeps a Date the sheet reader already converted, without shifting it", () => {
    expect(day(parseSheetDate(new Date(2026, 7, 18, 23, 30)))).toBe("2026-08-18");
  });

  it("falls back rather than inventing a date", () => {
    const fallback = new Date(2026, 0, 1);
    expect(day(parseSheetDate("", fallback))).toBe("2026-01-01");
    expect(day(parseSheetDate("not a date", fallback))).toBe("2026-01-01");
  });
});

describe("amounts as they actually appear", () => {
  it("strips symbols and separators", () => {
    expect(parseSheetAmount("₹1,250.50")).toBe(125050);
    expect(parseSheetAmount("1,250")).toBe(125000);
    expect(parseSheetAmount("Rs. 500")).toBe(50000);
    expect(parseSheetAmount(650)).toBe(65000);
  });

  it("treats empty and junk as zero rather than NaN", () => {
    expect(parseSheetAmount("")).toBe(0);
    expect(parseSheetAmount("-")).toBe(0);
    expect(parseSheetAmount(null)).toBe(0);
    expect(parseSheetAmount("n/a")).toBe(0);
  });
});

describe("quantities", () => {
  it("defaults to 1 when the column is blank or nonsense", () => {
    expect(parseSheetQuantity("12")).toBe(12);
    expect(parseSheetQuantity("2.5")).toBe(2.5);
    expect(parseSheetQuantity("")).toBe(1);
    expect(parseSheetQuantity("0")).toBe(1);
    expect(parseSheetQuantity("abc")).toBe(1);
  });
});
