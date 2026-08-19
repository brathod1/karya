import { describe, expect, it } from "vitest";
import { computeEventProgress, computeProductionLine, validateCompletion } from "./events";
import { toMinor } from "@/lib/money";

describe("event production maths (requirements 19–21, 53)", () => {
  it("derives remaining, progress and status for a partially made line", () => {
    const result = computeProductionLine({ quantityPlanned: 30, quantityCompleted: 12, unitPriceMinor: toMinor(250) });
    expect(result.remaining).toBe(18);
    expect(result.progressPct).toBe(40);
    expect(result.status).toBe("IN_PROGRESS");
    expect(result.expectedRevenueMinor).toBe(750000);
  });

  it("marks a line complete only when the planned quantity is reached", () => {
    expect(computeProductionLine({ quantityPlanned: 30, quantityCompleted: 30, unitPriceMinor: 0 }).status).toBe("COMPLETE");
    expect(computeProductionLine({ quantityPlanned: 30, quantityCompleted: 29, unitPriceMinor: 0 }).status).toBe("IN_PROGRESS");
    expect(computeProductionLine({ quantityPlanned: 30, quantityCompleted: 0, unitPriceMinor: 0 }).status).toBe("NOT_STARTED");
  });

  it("never reports negative remaining, and flags overproduction", () => {
    const result = computeProductionLine({ quantityPlanned: 10, quantityCompleted: 14, unitPriceMinor: 0 });
    expect(result.remaining).toBe(0);
    expect(result.progressPct).toBe(100);
    expect(result.isOverproduced).toBe(true);
  });

  it("reproduces the Ahmedabad University Fest example exactly", () => {
    const progress = computeEventProgress([
      { quantityPlanned: 50, quantityCompleted: 40, unitPriceMinor: toMinor(120) },
      { quantityPlanned: 30, quantityCompleted: 30, unitPriceMinor: toMinor(250) },
      { quantityPlanned: 15, quantityCompleted: 7, unitPriceMinor: toMinor(700) },
    ]);
    expect(progress.totalPlanned).toBe(95);
    expect(progress.totalCompleted).toBe(77);
    expect(progress.totalRemaining).toBe(18);
    expect(progress.expectedRevenueMinor).toBe(toMinor(6000) + toMinor(7500) + toMinor(10500));
    expect(progress.linesComplete).toBe(1);
  });

  it("blocks overproduction unless the org has allowed it", () => {
    expect(validateCompletion({ quantityPlanned: 10, quantityCompleted: 12, allowOverproduction: false }).ok).toBe(false);
    expect(validateCompletion({ quantityPlanned: 10, quantityCompleted: 12, allowOverproduction: true }).ok).toBe(true);
    expect(validateCompletion({ quantityPlanned: 10, quantityCompleted: -1, allowOverproduction: true }).ok).toBe(false);
  });
});
