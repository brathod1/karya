import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Exec } from "@/server/db";
import { numberSequences } from "@/server/db/schema";
import { renderNumber } from "@/lib/numbering-format";

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

/**
 * Allocates the next number. MUST be called inside the same transaction as the
 * row it numbers: the UPDATE ... RETURNING takes a row lock, so concurrent
 * creates queue rather than collide.
 */
export async function allocateNumber(tx: Exec, orgId: string, entity: SequenceEntity, on = new Date()): Promise<string> {
  const [existing] = await tx
    .select()
    .from(numberSequences)
    .where(and(eq(numberSequences.orgId, orgId), eq(numberSequences.entityType, entity)))
    .limit(1);

  const defaults = DEFAULT_SEQUENCES[entity];

  if (!existing) {
    const [created] = await tx
      .insert(numberSequences)
      .values({ orgId, entityType: entity, prefix: defaults.prefix, pattern: defaults.pattern, resetPolicy: defaults.resetPolicy, nextValue: 2, lastResetAt: on })
      .returning();
    return renderNumber(created.pattern, created.prefix, 1, on);
  }

  const reset = needsReset(existing.resetPolicy, existing.lastResetAt, on);
  const value = reset ? 1 : existing.nextValue;

  await tx
    .update(numberSequences)
    .set({ nextValue: value + 1, lastResetAt: reset ? on : existing.lastResetAt ?? on })
    .where(eq(numberSequences.id, existing.id));

  return renderNumber(existing.pattern, existing.prefix, value, on);
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
