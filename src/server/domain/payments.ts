/**
 * Balance and payment status.
 *
 * "Advance paid" is never a stored number the user can edit. It is the sum of
 * real payment records, which is what makes multiple payments, mixed methods,
 * refunds and reporting possible (requirements 27 and 40).
 */
import { type Minor } from "@/lib/money";

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";
export type OverpaymentPolicy = "REJECT" | "CREDIT" | "FLAG";

export type PaymentRow = {
  amountMinor: Minor;
  kind?: "PAYMENT" | "REFUND" | "CREDIT";
  voidedAt?: Date | null;
};

/** Net amount actually received against an order. Refunds subtract; voided rows are ignored. */
export function paidTotal(payments: PaymentRow[]): Minor {
  return payments.reduce((acc, p) => {
    if (p.voidedAt) return acc;
    const signed = p.kind === "REFUND" ? -Math.abs(p.amountMinor) : p.amountMinor;
    return acc + signed;
  }, 0);
}

export function balanceDue(totalMinor: Minor, paidMinor: Minor): Minor {
  return totalMinor - paidMinor;
}

export function derivePaymentStatus(totalMinor: Minor, paidMinor: Minor): PaymentStatus {
  if (paidMinor <= 0) return totalMinor <= 0 ? "PAID" : "UNPAID";
  if (paidMinor > totalMinor) return "OVERPAID";
  if (paidMinor === totalMinor) return "PAID";
  return "PARTIAL";
}

export type PaymentValidation =
  | { ok: true; excessMinor: Minor; flag: "NONE" | "OVERPAID" | "CREDIT" }
  | { ok: false; reason: string; outstandingMinor: Minor };

/**
 * Requirement 43. The default policy is FLAG, deliberately: refusing to record
 * money the owner has physically received is worse than showing her a flag.
 */
export function validatePayment(args: {
  amountMinor: Minor;
  totalMinor: Minor;
  alreadyPaidMinor: Minor;
  policy: OverpaymentPolicy;
  kind?: "PAYMENT" | "REFUND" | "CREDIT";
}): PaymentValidation {
  const { amountMinor, totalMinor, alreadyPaidMinor, policy, kind = "PAYMENT" } = args;

  if (amountMinor === 0) return { ok: false, reason: "Enter an amount greater than zero.", outstandingMinor: totalMinor - alreadyPaidMinor };
  if (amountMinor < 0) return { ok: false, reason: "Amount cannot be negative. Record a refund instead.", outstandingMinor: totalMinor - alreadyPaidMinor };

  if (kind === "REFUND") {
    if (amountMinor > alreadyPaidMinor) {
      return { ok: false, reason: "You cannot refund more than has been received.", outstandingMinor: totalMinor - alreadyPaidMinor };
    }
    return { ok: true, excessMinor: 0, flag: "NONE" };
  }

  const outstanding = totalMinor - alreadyPaidMinor;
  const excess = amountMinor - outstanding;

  if (excess <= 0) return { ok: true, excessMinor: 0, flag: "NONE" };

  switch (policy) {
    case "REJECT":
      return { ok: false, reason: `That is more than the outstanding balance. Outstanding is ${outstanding} minor units.`, outstandingMinor: outstanding };
    case "CREDIT":
      return { ok: true, excessMinor: excess, flag: "CREDIT" };
    case "FLAG":
    default:
      return { ok: true, excessMinor: excess, flag: "OVERPAID" };
  }
}

/**
 * Customer credit.
 *
 * Under the CREDIT overpayment policy the excess is not silently absorbed: it
 * becomes a `CREDIT` row that belongs to the customer rather than to any order.
 * Spending it writes a negative `CREDIT` row, so the balance is always the sum
 * of the ledger and never a stored figure that can drift.
 */
export function creditBalance(rows: { amountMinor: Minor; kind?: string | null; voidedAt?: Date | null }[]): Minor {
  return rows.reduce((total, row) => (!row.voidedAt && row.kind === "CREDIT" ? total + row.amountMinor : total), 0);
}

export type BalanceView = {
  totalMinor: Minor;
  paidMinor: Minor;
  balanceMinor: Minor;
  status: PaymentStatus;
};

export function balanceView(totalMinor: Minor, payments: PaymentRow[]): BalanceView {
  const paidMinor = paidTotal(payments);
  return {
    totalMinor,
    paidMinor,
    balanceMinor: balanceDue(totalMinor, paidMinor),
    status: derivePaymentStatus(totalMinor, paidMinor),
  };
}
