import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import type { Exec } from "@/server/db";
import { numberSequences, orders } from "@/server/db/schema";
import { extractSeq, lowestAvailable, renderNumber, splitPattern, type PatternParts } from "@/lib/numbering-format";

export { renderNumber };

/**
 * Human-readable document numbers (ORD-2026-0042, CUS-00042, EXP-00018, EVT-00007).
 *
 * These are labels, never identity: every foreign key points at a UUID, so a
 * business can renumber its documents without touching a single relationship.
 * Spreadsheet serial numbers are import metadata, nothing more.
 */

export type SequenceEntity = "ORDER" | "CUSTOMER" | "PRODUCT" | "EXPENSE" | "EVENT";

export const DEFAULT_SEQUENCES: Record<SequenceEntity, { prefix: string; pattern: string; resetPolicy: "NEVER" | "YEARLY" | "MONTHLY" }> = {
  ORDER:    { prefix: "ORD", pattern: "{PREFIX}-{YYYY}-{SEQ:4}", resetPolicy: "YEARLY" },
  CUSTOMER: { prefix: "CUS", pattern: "{PREFIX}-{SEQ:5}", resetPolicy: "NEVER" },
  PRODUCT:  { prefix: "PRD", pattern: "{PREFIX}-{SEQ:5}", resetPolicy: "NEVER" },
  EXPENSE:  { prefix: "EXP", pattern: "{PREFIX}-{SEQ:5}", resetPolicy: "NEVER" },
  EVENT:    { prefix: "EVT", pattern: "{PREFIX}-{SEQ:5}", resetPolicy: "NEVER" },
};

function needsReset(policy: string, lastResetAt: Date | null, on: Date): boolean {
  if (!lastResetAt) return false;
  if (policy === "YEARLY") return lastResetAt.getFullYear() !== on.getFullYear();
  if (policy === "MONTHLY") return lastResetAt.getFullYear() !== on.getFullYear() || lastResetAt.getMonth() !== on.getMonth();
  return false;
}

/** Escapes LIKE wildcards so a user-configured prefix is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Every sequence value currently carried by this org's orders in the pattern's
 * period — live AND archived alike. An archived order still exists and can be
 * restored, so its number stays taken (the unique index on (org_id, number)
 * would reject a reuse anyway). Only permanent deletion, which removes the row,
 * returns a number to the pool.
 */
async function usedOrderSeqs(tx: Exec, orgId: string, parts: PatternParts): Promise<Set<number>> {
  const rows = await tx
    .select({ number: orders.number })
    .from(orders)
    .where(and(eq(orders.orgId, orgId), like(orders.number, `${escapeLike(parts.before)}%`)));
  const used = new Set<number>();
  for (const row of rows) {
    const seq = extractSeq(row.number, parts);
    if (seq !== null) used.add(seq);
  }
  return used;
}

/**
 * Allocates the next number. MUST be called inside the same transaction as the
 * row it numbers. The SELECT ... FOR UPDATE on the sequence row serialises
 * concurrent allocations for the same org + entity: the second transaction
 * blocks until the first commits, then sees its rows. The unique index on
 * (org_id, number) remains the backstop.
 *
 * Orders fill gaps: a new order takes the LOWEST sequence not carried by any
 * existing order of the org in the pattern's period (per year under the default
 * yearly pattern). Numbers freed by permanent deletion are re-issued; archived
 * orders keep theirs; existing orders are never renumbered. Other entities keep
 * the plain incrementing counter.
 */
export async function allocateNumber(tx: Exec, orgId: string, entity: SequenceEntity, on = new Date()): Promise<string> {
  const defaults = DEFAULT_SEQUENCES[entity];

  let [row] = await tx
    .select()
    .from(numberSequences)
    .where(and(eq(numberSequences.orgId, orgId), eq(numberSequences.entityType, entity)))
    .limit(1)
    .for("update");

  if (!row) {
    // First allocation for this org + entity. onConflictDoNothing plus
    // re-select (with the lock) keeps two concurrent first allocations from
    // both inserting or both proceeding.
    await tx
      .insert(numberSequences)
      .values({ orgId, entityType: entity, prefix: defaults.prefix, pattern: defaults.pattern, resetPolicy: defaults.resetPolicy, nextValue: 1, lastResetAt: on })
      .onConflictDoNothing();
    [row] = await tx
      .select()
      .from(numberSequences)
      .where(and(eq(numberSequences.orgId, orgId), eq(numberSequences.entityType, entity)))
      .limit(1)
      .for("update");
  }
  if (!row) throw new Error("Could not create the number sequence for this workspace.");

  const reset = needsReset(row.resetPolicy, row.lastResetAt, on);
  let value = reset ? 1 : row.nextValue;
  let next = value + 1;

  const parts = entity === "ORDER" ? splitPattern(row.pattern, row.prefix, on) : null;
  if (parts) {
    const used = await usedOrderSeqs(tx, orgId, parts);
    value = lowestAvailable(used);
    used.add(value);
    next = lowestAvailable(used); // keeps the settings page's "Next:" preview truthful
  }

  await tx
    .update(numberSequences)
    .set({ nextValue: next, lastResetAt: reset ? on : row.lastResetAt ?? on })
    .where(eq(numberSequences.id, row.id));

  return renderNumber(row.pattern, row.prefix, value, on);
}

export async function ensureSequences(tx: Exec, orgId: string) {
  const rows = (Object.keys(DEFAULT_SEQUENCES) as SequenceEntity[]).map((entity) => ({
    orgId,
    entityType: entity,
    prefix: DEFAULT_SEQUENCES[entity].prefix,
    pattern: DEFAULT_SEQUENCES[entity].pattern,
    resetPolicy: DEFAULT_SEQUENCES[entity].resetPolicy,
    nextValue: 1,
    lastResetAt: new Date(),
  }));
  await tx.insert(numberSequences).values(rows).onConflictDoNothing();
  return sql`1`;
}
