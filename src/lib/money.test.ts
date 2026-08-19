import { describe, expect, it } from "vitest";
import { formatMinor, multiply, percentOf, toMajor, toMinor } from "./money";

describe("money is integer minor units, never float", () => {
  it("parses the ways a shop owner actually types amounts", () => {
    expect(toMinor("1250")).toBe(125000);
    expect(toMinor("1,250")).toBe(125000);
    expect(toMinor("1250.50")).toBe(125050);
    expect(toMinor("₹1,250.50")).toBe(125050);
    expect(toMinor("")).toBe(0);
    expect(toMinor(null)).toBe(0);
  });

  it("avoids the classic float error", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in minor units it is exact.
    expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3));
  });

  it("rounds multiplication to whole minor units", () => {
    expect(multiply(3333, 3)).toBe(9999);
    expect(multiply(10001, 0.5)).toBe(5001);
  });

  it("computes percentages on minor units", () => {
    expect(percentOf(100000, 18)).toBe(18000);
    expect(percentOf(12345, 10)).toBe(1235);
  });

  it("formats with the configured symbol, locale and position", () => {
    expect(formatMinor(125000, { symbol: "₹", locale: "en-IN" })).toBe("₹1,250");
    expect(formatMinor(125050, { symbol: "₹", locale: "en-IN" })).toBe("₹1,250.50");
    expect(formatMinor(125000, { symbol: "$", locale: "en-US" })).toBe("$1,250");
    expect(formatMinor(125000, { symbol: " kr", locale: "en-US", position: "after" })).toBe("1,250 kr");
    expect(formatMinor(-50000, { symbol: "₹", locale: "en-IN" })).toBe("-₹500");
  });

  it("groups Indian numbers the Indian way", () => {
    expect(formatMinor(12500000, { symbol: "₹", locale: "en-IN" })).toBe("₹1,25,000");
    expect(formatMinor(12500000, { symbol: "$", locale: "en-US" })).toBe("$125,000");
  });

  it("round-trips major and minor", () => {
    expect(toMajor(toMinor("999.99"))).toBe(999.99);
  });
});
