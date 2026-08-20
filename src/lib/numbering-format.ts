/**
 * Pure formatting for human-readable document numbers. Kept out of the
 * server-only module so the settings preview can render it in the browser
 * using exactly the same function the server uses to allocate.
 */
export function renderNumber(pattern: string, prefix: string, value: number, on = new Date()): string {
  return pattern
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{YYYY\}/g, String(on.getFullYear()))
    .replace(/\{YY\}/g, String(on.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(on.getMonth() + 1).padStart(2, "0"))
    .replace(/\{SEQ:(\d+)\}/g, (_m, digits) => String(value).padStart(Number(digits), "0"))
    .replace(/\{SEQ\}/g, String(value));
}

export type PatternParts = { before: string; after: string; digits: number };

/**
 * Splits a pattern around its {SEQ} token for a given date, rendering every
 * other token. "{PREFIX}-{YYYY}-{SEQ:4}" with prefix ORD on a 2026 date becomes
 * { before: "ORD-2026-", after: "", digits: 4 } — so the parts double as the
 * period scope: a 2027 number simply doesn't match a 2026 `before`.
 * Returns null when the pattern has no {SEQ} token.
 */
export function splitPattern(pattern: string, prefix: string, on = new Date()): PatternParts | null {
  const match = pattern.match(/\{SEQ(?::(\d+))?\}/);
  if (!match || match.index === undefined) return null;
  const render = (s: string) => s
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{YYYY\}/g, String(on.getFullYear()))
    .replace(/\{YY\}/g, String(on.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(on.getMonth() + 1).padStart(2, "0"));
  return {
    before: render(pattern.slice(0, match.index)),
    after: render(pattern.slice(match.index + match[0].length)),
    digits: match[1] ? Number(match[1]) : 0,
  };
}

/**
 * The sequence value a rendered number carries, or null when the number does
 * not belong to this pattern and period (different year, foreign format,
 * imported serial…).
 */
export function extractSeq(number: string, parts: PatternParts): number | null {
  if (!number.startsWith(parts.before) || !number.endsWith(parts.after)) return null;
  const middle = number.slice(parts.before.length, number.length - parts.after.length);
  if (!/^\d+$/.test(middle)) return null;
  return parseInt(middle, 10);
}

/**
 * The next sequence value to issue: whichever is higher of the stored counter
 * and (highest number visibly in use + 1). Numbers are NEVER reused — deleting
 * or archiving an order permanently consumes its number. The max-scan is a
 * self-healing guard: if the counter ever lags behind what actually exists
 * (e.g. after the counter was tampered with or lowered), allocation still
 * lands above every existing number.
 */
export function nextSequenceValue(counter: number, used: ReadonlySet<number>): number {
  let highest = 0;
  for (const v of used) if (v > highest) highest = v;
  return Math.max(counter, highest + 1);
}
