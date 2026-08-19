import { beforeAll, describe, expect, it } from "vitest";
import {
  financialYearLabel, financialYearOf, financialYearRange, monthKeyOf,
  resolvePeriod, selectableFinancialYears, selectableYears,
} from "./period";

/** What actually reaches a Postgres `date` column. */
const sent = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date(2026, 7, 18); // 18 August 2026

beforeAll(() => { process.env.TZ = "Asia/Kolkata"; });

describe("presets", () => {
  it("covers this month end to end", () => {
    const p = resolvePeriod({ range: "month" }, today);
    expect([sent(p.from), sent(p.to)]).toEqual(["2026-08-01", "2026-08-31"]);
    expect(p.label).toBe("This month");
  });

  it("covers last month, including its real length", () => {
    const p = resolvePeriod({ range: "last-month" }, new Date(2026, 2, 15)); // March → February
    expect([sent(p.from), sent(p.to)]).toEqual(["2026-02-01", "2026-02-28"]);
  });

  it("covers three months inclusive of the current one", () => {
    const p = resolvePeriod({ range: "quarter" }, today);
    expect([sent(p.from), sent(p.to)]).toEqual(["2026-06-01", "2026-08-31"]);
  });

  it("falls back to this month when the range is unknown", () => {
    expect(resolvePeriod({ range: "nonsense" }, today).label).toBe("This month");
    expect(resolvePeriod({}, today).label).toBe("This month");
  });
});

describe("calendar years", () => {
  it("runs January to December", () => {
    const p = resolvePeriod({ year: "2025" }, today);
    expect([sent(p.from), sent(p.to)]).toEqual(["2025-01-01", "2025-12-31"]);
    expect(p.label).toBe("2025");
  });

  it("ignores an implausible year", () => {
    expect(resolvePeriod({ year: "abcd" }, today).label).toBe("This month");
    expect(resolvePeriod({ year: "12" }, today).label).toBe("This month");
  });
});

describe("Indian financial years", () => {
  it("runs 1 April to 31 March", () => {
    const p = resolvePeriod({ fy: "2025" }, today);
    expect([sent(p.from), sent(p.to)]).toEqual(["2025-04-01", "2026-03-31"]);
    expect(p.label).toBe("FY 2025–26");
  });

  it("labels the span the way an accountant writes it", () => {
    expect(financialYearLabel(2025)).toBe("FY 2025–26");
    expect(financialYearLabel(2029)).toBe("FY 2029–30");
  });

  it("puts January in the financial year that began the previous April", () => {
    expect(financialYearOf(new Date(2026, 0, 15))).toBe(2025);
    expect(financialYearOf(new Date(2026, 2, 31))).toBe(2025);
    expect(financialYearOf(new Date(2026, 3, 1))).toBe(2026);
  });

  it("brackets the year correctly at both ends", () => {
    const range = financialYearRange(2025);
    expect([sent(range.from), sent(range.to)]).toEqual(["2025-04-01", "2026-03-31"]);
  });
});

describe("months and month runs", () => {
  it("takes a single month", () => {
    const p = resolvePeriod({ from: "2026-05" }, today);
    expect([sent(p.from), sent(p.to)]).toEqual(["2026-05-01", "2026-05-31"]);
    expect(p.label).toBe("May 2026");
  });

  it("takes a run of months within one year", () => {
    const p = resolvePeriod({ from: "2026-03", to: "2026-05" }, today);
    expect([sent(p.from), sent(p.to)]).toEqual(["2026-03-01", "2026-05-31"]);
    expect(p.label).toBe("Mar–May 2026");
  });

  it("takes a run that crosses a year boundary", () => {
    const p = resolvePeriod({ from: "2025-11", to: "2026-02" }, today);
    expect([sent(p.from), sent(p.to)]).toEqual(["2025-11-01", "2026-02-28"]);
    expect(p.label).toBe("Nov 2025 – Feb 2026");
  });

  it("takes exact days when given them", () => {
    const p = resolvePeriod({ from: "2026-08-01", to: "2026-08-15" }, today);
    expect([sent(p.from), sent(p.to)]).toEqual(["2026-08-01", "2026-08-15"]);
    expect(p.label).toBe("1 Aug 2026 – 15 Aug 2026");
  });

  it("ignores a backwards range rather than returning nothing", () => {
    expect(resolvePeriod({ from: "2026-05", to: "2026-03" }, today).label).toBe("This month");
  });

  it("formats month keys for the wire", () => {
    expect(monthKeyOf(2026, 0)).toBe("2026-01");
    expect(monthKeyOf(2026, 11)).toBe("2026-12");
  });
});

describe("what to offer in the picker", () => {
  it("lists years back to the earliest data", () => {
    expect(selectableYears(new Date(2024, 5, 1), today)).toEqual([2026, 2025, 2024]);
  });

  it("lists financial years back to the earliest data", () => {
    expect(selectableFinancialYears(new Date(2024, 5, 1), today)).toEqual([2026, 2025, 2024]);
  });

  it("offers the current year when there is no data at all", () => {
    expect(selectableYears(null, today)).toEqual([2026]);
  });
});
