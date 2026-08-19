/**
 * The pricing engine.
 *
 * Every price shown or stored anywhere in the product comes from this file.
 * No page, form, table, export, or report is permitted to compute a price or a
 * total itself. Requirements 6, 7, 14 and 54 all live here.
 */
import { clampNonNegative, multiply, percentOf, sum, type Minor } from "@/lib/money";

export type PriceSource =
  | "ORDER_OVERRIDE"      // the owner typed a price on this specific order
  | "CUSTOMER_PRODUCT"    // an agreed price for this customer and this product
  | "CUSTOMER_RULE"       // a customer-wide rule, e.g. 10% off everything
  | "PRODUCT_DEFAULT"     // the product's catalogue price
  | "MANUAL";             // free-text line with no product behind it

export type PriceRule = {
  productId: string | null;   // null = customer-wide rule
  priceMinor: number | null;
  discountPercent: number | null;
  validFrom?: Date | null;
  validTo?: Date | null;
};

export type ResolvePriceInput = {
  productDefaultMinor: Minor;
  /** All pricing rules for the chosen customer (product-specific and customer-wide). */
  customerRules?: PriceRule[];
  productId?: string | null;
  /** A price explicitly typed on this order. Always wins. */
  overrideMinor?: Minor | null;
  /** Set false to ignore customer pricing entirely (org configuration). */
  enableCustomerSpecificPricing?: boolean;
  on?: Date;
};

export type ResolvedPrice = {
  unitPriceMinor: Minor;
  source: PriceSource;
  /** Short human explanation shown under the price field, e.g. "Priya's price". */
  explanation: string;
};

function ruleApplies(rule: PriceRule, on: Date): boolean {
  if (rule.validFrom && on < rule.validFrom) return false;
  if (rule.validTo && on > rule.validTo) return false;
  return true;
}

/**
 * Resolution order (requirement 14):
 *   1. order-specific override
 *   2. customer + product agreed price
 *   3. customer-wide rule (fixed price or percentage discount)
 *   4. product default price
 */
export function resolveUnitPrice(input: ResolvePriceInput): ResolvedPrice {
  const {
    productDefaultMinor, customerRules = [], productId = null,
    overrideMinor = null, enableCustomerSpecificPricing = true, on = new Date(),
  } = input;

  if (overrideMinor !== null && overrideMinor !== undefined) {
    return { unitPriceMinor: clampNonNegative(overrideMinor), source: "ORDER_OVERRIDE", explanation: "Price set on this order" };
  }

  if (enableCustomerSpecificPricing && productId) {
    const specific = customerRules.find((r) => r.productId === productId && ruleApplies(r, on));
    if (specific) {
      if (specific.priceMinor !== null && specific.priceMinor !== undefined) {
        return { unitPriceMinor: clampNonNegative(specific.priceMinor), source: "CUSTOMER_PRODUCT", explanation: "Agreed price for this customer" };
      }
      if (specific.discountPercent) {
        const discounted = productDefaultMinor - percentOf(productDefaultMinor, specific.discountPercent);
        return {
          unitPriceMinor: clampNonNegative(discounted),
          source: "CUSTOMER_PRODUCT",
          explanation: `${specific.discountPercent}% off for this customer`,
        };
      }
    }
  }

  if (enableCustomerSpecificPricing) {
    const wide = customerRules.find((r) => r.productId === null && ruleApplies(r, on));
    if (wide) {
      if (wide.discountPercent) {
        const discounted = productDefaultMinor - percentOf(productDefaultMinor, wide.discountPercent);
        return {
          unitPriceMinor: clampNonNegative(discounted),
          source: "CUSTOMER_RULE",
          explanation: `${wide.discountPercent}% customer discount`,
        };
      }
      if (wide.priceMinor !== null && wide.priceMinor !== undefined) {
        return { unitPriceMinor: clampNonNegative(wide.priceMinor), source: "CUSTOMER_RULE", explanation: "Customer pricing rule" };
      }
    }
  }

  return { unitPriceMinor: clampNonNegative(productDefaultMinor), source: "PRODUCT_DEFAULT", explanation: "Catalogue price" };
}

// ───────────────────────────── totals

export type LineInput = {
  quantity: number;
  unitPriceMinor: Minor;
  discountMinor?: Minor;
};

export type LineResult = { lineTotalMinor: Minor };

export function computeLine(line: LineInput): LineResult {
  const gross = multiply(line.unitPriceMinor, line.quantity);
  return { lineTotalMinor: clampNonNegative(gross - (line.discountMinor ?? 0)) };
}

export type OrderTotalsInput = {
  lines: LineInput[];
  discountType?: "AMOUNT" | "PERCENT";
  discountValue?: number;
  additionalChargesMinor?: Minor;
  /** Only applied when the organisation has tax enabled. */
  taxRatePercent?: number;
  taxEnabled?: boolean;
  taxInclusive?: boolean;
};

export type OrderTotals = {
  lineTotals: Minor[];
  subtotalMinor: Minor;
  discountMinor: Minor;
  additionalChargesMinor: Minor;
  taxMinor: Minor;
  totalMinor: Minor;
};

/**
 *   subtotal            = Σ line totals
 *   − order discount    (fixed amount, or percentage of subtotal)
 *   + additional charges
 *   + tax               (only when enabled; exclusive by default)
 *   = order total
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const lineTotals = input.lines.map((l) => computeLine(l).lineTotalMinor);
  const subtotalMinor = sum(lineTotals);

  const rawDiscount = input.discountType === "PERCENT"
    ? percentOf(subtotalMinor, input.discountValue ?? 0)
    : Math.round(input.discountValue ?? 0);
  const discountMinor = Math.min(clampNonNegative(rawDiscount), subtotalMinor);

  const additionalChargesMinor = clampNonNegative(input.additionalChargesMinor ?? 0);
  const netBeforeTax = subtotalMinor - discountMinor + additionalChargesMinor;

  let taxMinor = 0;
  let totalMinor = netBeforeTax;

  if (input.taxEnabled && (input.taxRatePercent ?? 0) > 0) {
    const rate = input.taxRatePercent ?? 0;
    if (input.taxInclusive) {
      // The entered amounts already contain tax; we only report the component.
      taxMinor = Math.round((netBeforeTax * rate) / (100 + rate));
      totalMinor = netBeforeTax;
    } else {
      taxMinor = percentOf(netBeforeTax, rate);
      totalMinor = netBeforeTax + taxMinor;
    }
  }

  return {
    lineTotals,
    subtotalMinor,
    discountMinor,
    additionalChargesMinor,
    taxMinor,
    totalMinor: clampNonNegative(totalMinor),
  };
}

