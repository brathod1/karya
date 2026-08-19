/**
 * Money is represented everywhere as an integer number of MINOR units
 * (paise for INR, cents for USD). There is no floating point money in this
 * codebase and no currency symbol baked into any calculation.
 */

export type Minor = number;

export const MINOR_PER_MAJOR = 100;

/** "1,250.50" | "1250.5" | 1250.5  ->  125050 */
export function toMinor(input: string | number | null | undefined): Minor {
  if (input === null || input === undefined || input === "") return 0;
  const raw = typeof input === "number" ? input : Number(String(input).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(raw)) return 0;
  return Math.round(raw * MINOR_PER_MAJOR);
}

/** 125050 -> 1250.5 */
export function toMajor(minor: Minor): number {
  return minor / MINOR_PER_MAJOR;
}

/** Multiply a minor-unit amount by a quantity, rounding half-up to the nearest minor unit. */
export function multiply(minor: Minor, quantity: number): Minor {
  return Math.round(minor * quantity);
}

/** Apply a percentage (e.g. 12.5) to a minor amount. */
export function percentOf(minor: Minor, percent: number): Minor {
  return Math.round((minor * percent) / 100);
}

export function sum(values: Minor[]): Minor {
  return values.reduce((a, b) => a + b, 0);
}

export function clampNonNegative(minor: Minor): Minor {
  return minor < 0 ? 0 : minor;
}

export type MoneyFormatOptions = {
  symbol: string;
  locale: string;
  position?: "before" | "after";
  /** Hide ".00" when the amount is a whole major unit. Default true — matches how shop owners write prices. */
  compactZeroDecimals?: boolean;
};

export function formatMinor(minor: Minor, opts: MoneyFormatOptions): string {
  const { symbol, locale, position = "before", compactZeroDecimals = true } = opts;
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const major = toMajor(abs);
  const fractionDigits = compactZeroDecimals && abs % MINOR_PER_MAJOR === 0 ? 0 : 2;
  const body = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2,
  }).format(major);
  const withSymbol = position === "before" ? `${symbol}${body}` : `${body}${symbol}`;
  return negative ? `-${withSymbol}` : withSymbol;
}
