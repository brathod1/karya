/**
 * Event / stall production planning maths (requirements 18–21).
 * Remaining, progress and production status are always derived, never stored.
 */
import { multiply, sum, type Minor } from "@/lib/money";

export type ProductionStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export type ProductionLine = {
  quantityPlanned: number;
  quantityCompleted: number;
  unitPriceMinor: Minor;
};

export type ProductionLineResult = {
  remaining: number;
  progressPct: number;
  status: ProductionStatus;
  expectedRevenueMinor: Minor;
  completedValueMinor: Minor;
  isOverproduced: boolean;
};

export function computeProductionLine(line: ProductionLine, completeThresholdPct = 100): ProductionLineResult {
  const planned = Math.max(line.quantityPlanned, 0);
  const completed = Math.max(line.quantityCompleted, 0);
  const remaining = Math.max(planned - completed, 0);
  const progressPct = planned === 0 ? 0 : Math.min(Math.round((completed / planned) * 100), 100);

  let status: ProductionStatus = "IN_PROGRESS";
  if (completed <= 0) status = "NOT_STARTED";
  else if (progressPct >= completeThresholdPct) status = "COMPLETE";

  return {
    remaining,
    progressPct,
    status,
    expectedRevenueMinor: multiply(line.unitPriceMinor, planned),
    completedValueMinor: multiply(line.unitPriceMinor, Math.min(completed, planned)),
    isOverproduced: completed > planned,
  };
}

export type EventProgress = {
  totalPlanned: number;
  totalCompleted: number;
  totalRemaining: number;
  progressPct: number;
  expectedRevenueMinor: Minor;
  completedValueMinor: Minor;
  linesComplete: number;
  linesTotal: number;
  status: ProductionStatus;
};

export function computeEventProgress(lines: ProductionLine[], completeThresholdPct = 100): EventProgress {
  const results = lines.map((l) => computeProductionLine(l, completeThresholdPct));
  const totalPlanned = sum(lines.map((l) => Math.max(l.quantityPlanned, 0)));
  const totalCompleted = sum(lines.map((l) => Math.max(l.quantityCompleted, 0)));
  const cappedCompleted = sum(lines.map((l) => Math.min(Math.max(l.quantityCompleted, 0), Math.max(l.quantityPlanned, 0))));
  const progressPct = totalPlanned === 0 ? 0 : Math.min(Math.round((cappedCompleted / totalPlanned) * 100), 100);

  let status: ProductionStatus = "IN_PROGRESS";
  if (totalCompleted <= 0) status = "NOT_STARTED";
  else if (progressPct >= completeThresholdPct) status = "COMPLETE";

  return {
    totalPlanned,
    totalCompleted,
    totalRemaining: Math.max(totalPlanned - cappedCompleted, 0),
    progressPct,
    expectedRevenueMinor: sum(results.map((r) => r.expectedRevenueMinor)),
    completedValueMinor: sum(results.map((r) => r.completedValueMinor)),
    linesComplete: results.filter((r) => r.status === "COMPLETE").length,
    linesTotal: lines.length,
    status,
  };
}

export function validateCompletion(args: {
  quantityPlanned: number;
  quantityCompleted: number;
  allowOverproduction: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (args.quantityCompleted < 0) return { ok: false, reason: "Completed quantity cannot be negative." };
  if (!args.allowOverproduction && args.quantityCompleted > args.quantityPlanned) {
    return {
      ok: false,
      reason: `You can't mark more than ${args.quantityPlanned} as made. Raise the planned quantity, or turn on overproduction in Settings.`,
    };
  }
  return { ok: true };
}
