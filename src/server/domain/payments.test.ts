import { describe, expect, it } from "vitest";
import { balanceView, creditBalance, derivePaymentStatus, paidTotal, validatePayment } from "./payments";
import { toMinor } from "@/lib/money";

describe("balances are derived, never stored (requirements 27, 40)", () => {
  it("sums multiple payments into the advance figure the sheet used to hold", () => {
    const payments = [{ amountMinor: toMinor(500) }, { amountMinor: toMinor(500) }, { amountMinor: toMinor(500) }];
    expect(paidTotal(payments)).toBe(150000);
    const view = balanceView(toMinor(1500), payments);
    expect(view.balanceMinor).toBe(0);
    expect(view.status).toBe("PAID");
  });

  it("subtracts refunds and ignores voided rows", () => {
    const payments = [
      { amountMinor: toMinor(1000) },
      { amountMinor: toMinor(200), kind: "REFUND" as const },
      { amountMinor: toMinor(500), voidedAt: new Date() },
    ];
    expect(paidTotal(payments)).toBe(80000);
  });

  it("derives every payment status correctly", () => {
    expect(derivePaymentStatus(toMinor(1000), 0)).toBe("UNPAID");
    expect(derivePaymentStatus(toMinor(1000), toMinor(400))).toBe("PARTIAL");
    expect(derivePaymentStatus(toMinor(1000), toMinor(1000))).toBe("PAID");
    expect(derivePaymentStatus(toMinor(1000), toMinor(1200))).toBe("OVERPAID");
    expect(derivePaymentStatus(0, 0)).toBe("PAID");
  });
});

describe("overpayment policy (requirement 43)", () => {
  const args = { amountMinor: toMinor(1200), totalMinor: toMinor(1000), alreadyPaidMinor: 0 };

  it("rejects when configured to reject", () => {
    const result = validatePayment({ ...args, policy: "REJECT" });
    expect(result.ok).toBe(false);
  });

  it("accepts and marks the excess as credit when configured to credit", () => {
    const result = validatePayment({ ...args, policy: "CREDIT" });
    expect(result).toMatchObject({ ok: true, flag: "CREDIT", excessMinor: 20000 });
  });

  it("accepts and flags by default, because refusing received money is worse", () => {
    const result = validatePayment({ ...args, policy: "FLAG" });
    expect(result).toMatchObject({ ok: true, flag: "OVERPAID", excessMinor: 20000 });
  });

  it("accepts an exact settlement with no flag", () => {
    const result = validatePayment({ amountMinor: toMinor(1000), totalMinor: toMinor(1000), alreadyPaidMinor: 0, policy: "REJECT" });
    expect(result).toMatchObject({ ok: true, flag: "NONE" });
  });

  it("refuses zero, negative, and over-large refunds", () => {
    expect(validatePayment({ ...args, amountMinor: 0, policy: "FLAG" }).ok).toBe(false);
    expect(validatePayment({ ...args, amountMinor: -100, policy: "FLAG" }).ok).toBe(false);
    expect(validatePayment({
      amountMinor: toMinor(900), totalMinor: toMinor(1000), alreadyPaidMinor: toMinor(500),
      policy: "FLAG", kind: "REFUND",
    }).ok).toBe(false);
  });
});

describe("customer credit ledger", () => {
  it("is the sum of credit rows, ignoring ordinary payments and voided rows", () => {
    expect(creditBalance([
      { amountMinor: toMinor(1000), kind: "PAYMENT" },        // an order payment, not credit
      { amountMinor: toMinor(200), kind: "CREDIT" },          // overpayment kept as credit
      { amountMinor: toMinor(50), kind: "CREDIT", voidedAt: new Date() },
    ])).toBe(20000);
  });

  it("goes down when credit is spent, and can reach exactly zero", () => {
    expect(creditBalance([
      { amountMinor: toMinor(200), kind: "CREDIT" },
      { amountMinor: -toMinor(120), kind: "CREDIT" },
    ])).toBe(8000);
    expect(creditBalance([
      { amountMinor: toMinor(200), kind: "CREDIT" },
      { amountMinor: -toMinor(200), kind: "CREDIT" },
    ])).toBe(0);
  });

  it("is zero when nothing has ever been credited", () => {
    expect(creditBalance([{ amountMinor: toMinor(500), kind: "PAYMENT" }])).toBe(0);
    expect(creditBalance([])).toBe(0);
  });
});
