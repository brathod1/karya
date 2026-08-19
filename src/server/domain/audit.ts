import "server-only";
import type { Exec } from "@/server/db";
import { activityEntries, auditLogs } from "@/server/db/schema";

type EntityType = "ORDER" | "ORDER_ITEM" | "CUSTOMER" | "PRODUCT" | "EXPENSE" | "EVENT";

export type Actor = { userId: string | null; name: string | null };

/**
 * Two separate records, on purpose:
 *  · ActivityEntry — the human timeline shown on a detail page.
 *  · AuditLog      — the compliance trail; append-only, never editable in the UI.
 * Both are written inside the same transaction as the change, so a mutation
 * cannot commit without its history.
 */
export async function logActivity(tx: Exec, args: {
  orgId: string; entityType: EntityType; entityId: string;
  type: string; message: string; meta?: unknown; actor?: Actor;
}) {
  await tx.insert(activityEntries).values({
    orgId: args.orgId,
    entityType: args.entityType,
    entityId: args.entityId,
    type: args.type,
    message: args.message,
    meta: (args.meta ?? null) as never,
    actorUserId: args.actor?.userId ?? null,
    actorName: args.actor?.name ?? null,
  });
}

export async function logAudit(tx: Exec, args: {
  orgId: string; action: string; entityType: string; entityId: string;
  before?: unknown; after?: unknown; actor?: Actor;
}) {
  await tx.insert(auditLogs).values({
    orgId: args.orgId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    before: (args.before ?? null) as never,
    after: (args.after ?? null) as never,
    actorUserId: args.actor?.userId ?? null,
    actorName: args.actor?.name ?? null,
  });
}

/** Shallow diff used to keep audit payloads small and readable. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const bv = before[key];
    const av = after[key];
    const same = bv instanceof Date && av instanceof Date ? bv.getTime() === av.getTime() : bv === av;
    if (!same) { b[key] = bv; a[key] = av; }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
