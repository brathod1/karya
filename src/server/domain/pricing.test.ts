import { describe, expect, it } from "vitest";
import { computeLine, computeOrderTotals, resolveUnitPrice } from "./pricing";
import { toMinor } from "@/lib/money";

describe("pricing engine — price resolution (requirement 14)", () => {
  const base = { productDefaultMinor: toMinor(500), productId: "p1" };

  it("falls back to the catalogue price when there is nothing else", () => {
    const result = resolveUnitPrice(base);
    expect(result.unitPriceMinor).toBe(50000);
    expect(result.source).toBe("PRODUCT_DEFAULT");
  });

  it("uses a customer + product agreed price over the catalogue price", () => {
    const result = resolveUnitPrice({
      ...base,
      customerRules: [{ productId: "p1", priceMinor: toMinor(650), discountPercent: null }],
    });
    expect(result.unitPriceMinor).toBe(65000);
    expect(result.source).toBe("CUSTOMER_PRODUCT");
  });

  it("applies a customer-wide percentage rule when there is no specific price", () => {
    const result = resolveUnitPrice({
      ...base,
      customerRules: [{ productId: null, priceMinor: null, discountPercent: 10 }],
    });
    expect(result.unitPriceMinor).toBe(45000);
    expect(result.source).toBe("CUSTOMER_RULE");
  });

  it("prefers the specific product rule over the customer-wide rule", () => {
    const result = resolveUnitPrice({
      ...base,
      customerRules: [
        { productId: null, priceMinor: null, discountPercent: 50 },
        { productId: "p1", priceMinor: toMinor(550), discountPercent: null },
      ],
    });
    expect(result.unitPriceMinor).toBe(55000);
    expect(result.source).toBe("CUSTOMER_PRODUCT");
  });

  it("lets an order-level override beat everything", () => {
    const result = resolveUnitPrice({
      ...base,
      customerRules: [{ productId: "p1", priceMinor: toMinor(650), discountPercent: null }],
      overrideMinor: toMinor(450),
    });
    expect(result.unitPriceMinor).toBe(45000);
    expect(result.source).toBe("ORDER_OVERRIDE");
  });

  it("ignores customer pricing entirely when the org has it switched off", () => {
    const result = resolveUnitPrice({
      ...base,
      customerRules: [{ productId: "p1", priceMinor: toMinor(650), discountPercent: null }],
      enableCustomerSpecificPricing: false,
    });
    expect(result.source).toBe("PRODUCT_DEFAULT");
  });

  it("respects validity windows on a rule", () => {
    const past = { productId: "p1", priceMinor: toMinor(100), discountPercent: null, validTo: new Date("2020-01-01") };
    const result = resolveUnitPrice({ ...base, customerRules: [past], on: new Date("2026-01-01") });
    expect(result.source).toBe("PRODUCT_DEFAULT");
  });

  it("three customers, one product, three prices", () => {
    const price = (rule: { priceMinor: number } | null) =>
      resolveUnitPrice({ ...base, customerRules: rule ? [{ productId: "p1", priceMinor: rule.priceMinor, discountPercent: null }] : [] }).unitPriceMinor;
    expect(price({ priceMinor: toMinor(500) })).toBe(50000);
    expect(price({ priceMinor: toMinor(650) })).toBe(65000);
    expect(price({ priceMinor: toMinor(550) })).toBe(55000);
  });
});

describe("pricing engine — totals (requirement 7)", () => {
  it("multiplies quantity by unit price, rounding to whole minor units", () => {
    expect(computeLine({ quantity: 3, unitPriceMinor: 12550 }).lineTotalMinor).toBe(37650);
    expect(computeLine({ quantity: 1.5, unitPriceMinor: 3333 }).lineTotalMinor).toBe(5000);
  });

  it("never produces a negative line total", () => {
    expect(computeLine({ quantity: 1, unitPriceMinor: 1000, discountMinor: 5000 }).lineTotalMinor).toBe(0);
  });

  it("computes subtotal, discount, charges and total in order", () => {
    const totals = computeOrderTotals({
      lines: [{ quantity: 2, unitPriceMinor: toMinor(500) }, { quantity: 3, unitPriceMinor: toMinor(120) }],
      discountType: "AMOUNT",
      discountValue: toMinor(100),
      additionalChargesMinor: toMinor(50),
    });
    expect(totals.subtotalMinor).toBe(136000);
    expect(totals.discountMinor).toBe(10000);
    expect(totals.totalMinor).toBe(131000);
  });

  it("treats a percentage discount as a percentage of the subtotal", () => {
    const totals = computeOrderTotals({
      lines: [{ quantity: 1, unitPriceMinor: toMinor(1000) }],
      discountType: "PERCENT", discountValue: 15,
    });
    expect(totals.discountMinor).toBe(15000);
    expect(totals.totalMinor).toBe(85000);
  });

  it("caps a discount at the subtotal so a total can never go negative", () => {
    const totals = computeOrderTotals({
      lines: [{ quantity: 1, unitPriceMinor: toMinor(100) }],
      discountType: "AMOUNT", discountValue: toMinor(500),
    });
    expect(totals.discountMinor).toBe(10000);
    expect(totals.totalMinor).toBe(0);
  });

  it("adds exclusive tax on top and extracts inclusive tax from within", () => {
    const exclusive = computeOrderTotals({
      lines: [{ quantity: 1, unitPriceMinor: toMinor(1000) }], taxEnabled: true, taxRatePercent: 18,
    });
    expect(exclusive.taxMinor).toBe(18000);
    expect(exclusive.totalMinor).toBe(118000);

    const inclusive = computeOrderTotals({
      lines: [{ quantity: 1, unitPriceMinor: toMinor(1180) }], taxEnabled: true, taxRatePercent: 18, taxInclusive: true,
    });
    expect(inclusive.totalMinor).toBe(118000);
    expect(inclusive.taxMinor).toBe(18000);
  });

  it("ignores tax entirely when the org has not enabled it", () => {
    const totals = computeOrderTotals({
      lines: [{ quantity: 1, unitPriceMinor: toMinor(1000) }], taxEnabled: false, taxRatePercent: 18,
    });
    expect(totals.taxMinor).toBe(0);
    expect(totals.totalMinor).toBe(100000);
  });
});
