import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A regression guard for a bug that produced no error at all.
 *
 * Drizzle qualifies a column reference with its table name only when the query
 * contains a join. In a single-table query, `${customers.id}` renders as bare
 * `"id"` — and inside a correlated subquery over another table that resolves to
 * *that* table's `id`, matching nothing. The customer list showed every
 * customer with zero orders and zero spend, with nothing logged anywhere.
 *
 * So: correlated subqueries in read models must write their table names out in
 * full rather than interpolating a column.
 */
const source = readFileSync("src/server/queries.ts", "utf8");

describe("raw SQL in read models", () => {
  const correlatedSubqueries = source.match(/\(\s*select[\s\S]*?\)`/g) ?? [];

  it("has some correlated subqueries to check", () => {
    expect(correlatedSubqueries.length).toBeGreaterThan(0);
  });

  it("never interpolates a drizzle column inside a correlated subquery", () => {
    for (const fragment of correlatedSubqueries) {
      expect(
        fragment.includes("${"),
        `Correlated subquery interpolates a column, which drizzle may render unqualified:\n${fragment}`,
      ).toBe(false);
    }
  });

  it("qualifies every outer-table reference used to correlate", () => {
    for (const fragment of correlatedSubqueries) {
      const comparisons = fragment.match(/=\s*"[^"]+"(\."[^"]+")?/g) ?? [];
      for (const comparison of comparisons) {
        expect(
          comparison.includes('"."'),
          `Unqualified identifier in a correlated subquery: ${comparison}\nin:\n${fragment}`,
        ).toBe(true);
      }
    }
  });
});
