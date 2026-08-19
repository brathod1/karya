import { toMinor } from "./money";

/**
 * Parsing rules for spreadsheet cells.
 *
 * Kept pure and separate from the import action so they can be tested directly —
 * these two functions are where an Indian Google Sheets export is most likely to
 * be misread, so they carry the most risk in the whole import path.
 */

/**
 * Accepts ISO (`2026-08-15`), Indian/European `dd/mm/yyyy` and `dd-mm-yyyy`,
 * and real Date values that the sheet reader already converted.
 *
 * `dd/mm/yyyy` is assumed over `mm/dd/yyyy` because the reference business is
 * in India; the two are indistinguishable for days 1–12, so this is a deliberate
 * choice rather than a detection. Parsed dates are anchored at 12:00 UTC so they
 * survive the trip into a `date` column from any timezone.
 */
export function parseSheetDate(raw: unknown, fallback: Date = new Date()): Date {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12));
  }

  const text = String(raw ?? "").trim();
  if (!text) return anchor(fallback);

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return utc(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    return utc(year, Number(dmy[2]), Number(dmy[1]));
  }

  const loose = new Date(text);
  return Number.isNaN(loose.getTime()) ? anchor(fallback) : anchor(loose);
}

function utc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function anchor(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));
}

/**
 * Strips currency symbols, thousands separators and stray text: "₹1,250.50" → 125050.
 *
 * Deliberately matches the first *number* rather than deleting non-digits: a
 * label like "Rs. 500" contains a full stop, and simply removing everything
 * except digits and dots turns it into ".500", i.e. fifty paise.
 */
export function parseSheetAmount(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? toMinor(raw) : 0;
  const match = String(raw ?? "").match(/-?\d[\d,\s]*(?:\.\d+)?/);
  if (!match) return 0;
  return toMinor(match[0].replace(/[,\s]/g, ""));
}

/** "12", "12.5", "" → number, defaulting to 1 for a quantity column. */
export function parseSheetQuantity(raw: unknown, fallback = 1): number {
  const value = Number(String(raw ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
