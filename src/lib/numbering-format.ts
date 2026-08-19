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
