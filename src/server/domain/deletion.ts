import "server-only";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  activityEntries, attachments, auditLogs, customFieldValues, customerPrices, customers,
  eventProductionItems, events, expenses, orderItems, orders, payments, products,
} from "@/server/db/schema";
import { logAudit, type Actor } from "./audit";
import { mustExist } from "@/server/db/tenant";
import type { Exec } from "@/server/db";

/**
 * Removing records.
 *
 * Two operations, deliberately distinct:
 *
 *   archive — the everyday one. The record leaves the lists and stops counting
 *             towards any total, but it and its history survive and it can be
 *             brought back. Anything that money or history touched should be
 *             archived, never deleted.
 *
 *   delete  — for genuine mistakes: a duplicate, a test record. Irreversible.
 *             Refused outright when other records depend on it, because a
 *             product silently vanishing from a two-year-old order is a far
 *             worse outcome than an error message.
 *
 * Every deletion writes what it removed into the audit log *before* removing
 * it, so the fact of it outlives the record.
 */

type Base = { orgId: string; actor: Actor };
type EntityKind = "CUSTOMER" | "PRODUCT" | "EXPENSE" | "EVENT";

const TABLES = { CUSTOMER: customers, PRODUCT: products, EXPENSE: expenses, EVENT: events } as const;

export async function setArchived(args: Base & { kind: EntityKind; id: string; archived: boolean }) {
  const table = TABLES[args.kind];
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(table)
      .where(and(eq(table.orgId, args.orgId), eq(table.id, args.id))).limit(1);
    mustExist(row, args.kind);

    await tx.update(table)
      .set({ archivedAt: args.archived ? new Date() : null })
      .where(eq(table.id, args.id));

    await logAudit(tx, {
      orgId: args.orgId, actor: args.actor,
      action: args.archived ? `${args.kind.toLowerCase()}.archive` : `${args.kind.toLowerCase()}.restore`,
      entityType: args.kind, entityId: args.id,
      after: { archivedAt: args.archived ? new Date() : null },
    });
  });
}

/** What still points at this record, and therefore why it cannot be deleted. */
export type Blocker = { reason: string };

async function blockersFor(tx: Exec, orgId: string, kind: EntityKind, id: string): Promise<Blocker | null> {
  if (kind === "CUSTOMER") {
    const [{ value }] = await tx.select({ value: count() }).from(orders)
      .where(and(eq(orders.orgId, orgId), eq(orders.customerId, id)));
    if (value > 0) {
      return { reason: `This customer has ${value} order${value === 1 ? "" : "s"}. Archive them instead, or delete those orders first.` };
    }
  }

  if (kind === "PRODUCT") {
    const [{ value }] = await tx.select({ value: count() }).from(orderItems)
      .where(and(eq(orderItems.orgId, orgId), eq(orderItems.productId, id)));
    if (value > 0) {
      return { reason: `This item appears on ${value} order line${value === 1 ? "" : "s"}. Archive it instead — deleting it would leave holes in past orders.` };
    }
    const [{ value: planned }] = await tx.select({ value: count() }).from(eventProductionItems)
      .where(and(eq(eventProductionItems.orgId, orgId), eq(eventProductionItems.productId, id)));
    if (planned > 0) {
      return { reason: `This item is in ${planned} production plan line${planned === 1 ? "" : "s"}. Remove it from those first, or archive it.` };
    }
  }

  return null;
}

export async function canDelete(orgId: string, kind: EntityKind, id: string): Promise<Blocker | null> {
  return blockersFor(db, orgId, kind, id);
}

/**
 * Bulk equivalents.
 *
 * The obvious implementation — loop the single-record function — costs a
 * dependency check and a transaction per record. Against a database a few
 * hundred milliseconds away, fifty records is several hundred round trips and
 * over a minute of waiting, which is long enough for the request to be
 * abandoned half-finished. These do the same work in a fixed number of queries
 * regardless of how many records are selected.
 */
export const BULK_LIMIT = 500;

/** One query per dependency type, rather than one per record. */
async function blockersForMany(
  tx: Exec, orgId: string, kind: EntityKind, ids: string[],
): Promise<Map<string, string>> {
  const blocked = new Map<string, string>();
  if (ids.length === 0) return blocked;

  if (kind === "CUSTOMER") {
    const rows = await tx
      .select({ id: orders.customerId, value: count() })
      .from(orders)
      .where(and(eq(orders.orgId, orgId), inArray(orders.customerId, ids)))
      .groupBy(orders.customerId);
    for (const row of rows) {
      if (row.id && row.value > 0) {
        blocked.set(row.id, `has ${row.value} order${row.value === 1 ? "" : "s"}`);
      }
    }
  }

  if (kind === "PRODUCT") {
    const [sold, planned] = await Promise.all([
      tx.select({ id: orderItems.productId, value: count() })
        .from(orderItems)
        .where(and(eq(orderItems.orgId, orgId), inArray(orderItems.productId, ids)))
        .groupBy(orderItems.productId),
      tx.select({ id: eventProductionItems.productId, value: count() })
        .from(eventProductionItems)
        .where(and(eq(eventProductionItems.orgId, orgId), inArray(eventProductionItems.productId, ids)))
        .groupBy(eventProductionItems.productId),
    ]);
    for (const row of sold) {
      if (row.id && row.value > 0) blocked.set(row.id, `is on ${row.value} order line${row.value === 1 ? "" : "s"}`);
    }
    for (const row of planned) {
      if (row.id && row.value > 0 && !blocked.has(row.id)) {
        blocked.set(row.id, `is in ${row.value} production plan line${row.value === 1 ? "" : "s"}`);
      }
    }
  }

  return blocked;
}

export async function setArchivedMany(args: Base & { kind: EntityKind; ids: string[]; archived: boolean }) {
  const table = TABLES[args.kind];
  const ids = args.ids.slice(0, BULK_LIMIT);
  if (ids.length === 0) return { count: 0 };

  return db.transaction(async (tx) => {
    const archivedAt = args.archived ? new Date() : null;
    const updated = await tx.update(table).set({ archivedAt })
      .where(and(eq(table.orgId, args.orgId), inArray(table.id, ids)))
      .returning({ id: table.id });

    if (updated.length > 0) {
      await tx.insert(auditLogs).values(updated.map((row) => ({
        orgId: args.orgId,
        actorUserId: args.actor.userId,
        actorName: args.actor.name,
        action: args.archived ? `${args.kind.toLowerCase()}.archive` : `${args.kind.toLowerCase()}.restore`,
        entityType: args.kind,
        entityId: row.id,
        after: { archivedAt } as never,
      })));
    }

    return { count: updated.length };
  });
}

export async function deleteManyPermanently(args: Base & { kind: EntityKind; ids: string[] }) {
  const { orgId, actor, kind } = args;
  const table = TABLES[kind];
  const requested = args.ids.slice(0, BULK_LIMIT);
  if (requested.length === 0) return { deleted: 0, skipped: 0, firstReason: null, attachmentsToRemove: [] as string[] };

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(table)
      .where(and(eq(table.orgId, orgId), inArray(table.id, requested)));
    if (rows.length === 0) return { deleted: 0, skipped: 0, firstReason: null, attachmentsToRemove: [] as string[] };

    const blocked = await blockersForMany(tx, orgId, kind, rows.map((r) => r.id));
    const allowed = rows.filter((r) => !blocked.has(r.id));
    const allowedIds = allowed.map((r) => r.id);

    const firstBlocked = [...blocked.entries()][0];
    const firstReason = firstBlocked
      ? `${rows.find((r) => r.id === firstBlocked[0]) && "name" in (rows.find((r) => r.id === firstBlocked[0]) as object)
          ? String((rows.find((r) => r.id === firstBlocked[0]) as { name?: string }).name)
          : "One record"} ${firstBlocked[1]}. Archive instead.`
      : null;

    if (allowedIds.length === 0) {
      return { deleted: 0, skipped: blocked.size, firstReason, attachmentsToRemove: [] as string[] };
    }

    // What was removed is recorded before it is removed.
    await tx.insert(auditLogs).values(allowed.map((row) => ({
      orgId, actorUserId: actor.userId, actorName: actor.name,
      action: `${kind.toLowerCase()}.delete`,
      entityType: kind, entityId: row.id,
      before: row as never, after: null,
    })));

    if (kind === "CUSTOMER") {
      await tx.delete(customerPrices).where(and(eq(customerPrices.orgId, orgId), inArray(customerPrices.customerId, allowedIds)));
      await tx.delete(payments).where(and(eq(payments.orgId, orgId), inArray(payments.customerId, allowedIds)));
    }
    if (kind === "PRODUCT") {
      await tx.delete(customerPrices).where(and(eq(customerPrices.orgId, orgId), inArray(customerPrices.productId, allowedIds)));
    }
    if (kind === "EVENT") {
      await tx.delete(eventProductionItems).where(and(eq(eventProductionItems.orgId, orgId), inArray(eventProductionItems.eventId, allowedIds)));
    }

    await tx.delete(customFieldValues).where(and(
      eq(customFieldValues.orgId, orgId), eq(customFieldValues.entityType, kind), inArray(customFieldValues.entityId, allowedIds),
    ));
    await tx.delete(activityEntries).where(and(
      eq(activityEntries.orgId, orgId), eq(activityEntries.entityType, kind), inArray(activityEntries.entityId, allowedIds),
    ));

    const files = await tx.select().from(attachments).where(and(
      eq(attachments.orgId, orgId), eq(attachments.entityType, kind), inArray(attachments.entityId, allowedIds),
    ));
    await tx.delete(attachments).where(and(
      eq(attachments.orgId, orgId), eq(attachments.entityType, kind), inArray(attachments.entityId, allowedIds),
    ));

    await tx.delete(table).where(and(eq(table.orgId, orgId), inArray(table.id, allowedIds)));

    return {
      deleted: allowedIds.length,
      skipped: blocked.size,
      firstReason,
      attachmentsToRemove: files.map((f) => f.storageKey),
    };
  });
}

export async function deletePermanently(args: Base & { kind: EntityKind; id: string }) {
  const { orgId, actor, kind, id } = args;
  const table = TABLES[kind];

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(table)
      .where(and(eq(table.orgId, orgId), eq(table.id, id))).limit(1);
    mustExist(row, kind);

    const blocker = await blockersFor(tx, orgId, kind, id);
    if (blocker) throw new Error(blocker.reason);

    await logAudit(tx, {
      orgId, actor, action: `${kind.toLowerCase()}.delete`,
      entityType: kind, entityId: id, before: row as unknown as Record<string, unknown>, after: null,
    });

    // Records that belong to this one and have no meaning without it.
    if (kind === "CUSTOMER") {
      await tx.delete(customerPrices).where(and(eq(customerPrices.orgId, orgId), eq(customerPrices.customerId, id)));
      await tx.delete(payments).where(and(eq(payments.orgId, orgId), eq(payments.customerId, id)));
    }
    if (kind === "PRODUCT") {
      await tx.delete(customerPrices).where(and(eq(customerPrices.orgId, orgId), eq(customerPrices.productId, id)));
    }
    if (kind === "EVENT") {
      await tx.delete(eventProductionItems).where(and(eq(eventProductionItems.orgId, orgId), eq(eventProductionItems.eventId, id)));
    }

    await tx.delete(customFieldValues).where(and(
      eq(customFieldValues.orgId, orgId), eq(customFieldValues.entityType, kind), eq(customFieldValues.entityId, id),
    ));
    await tx.delete(activityEntries).where(and(
      eq(activityEntries.orgId, orgId), eq(activityEntries.entityType, kind), eq(activityEntries.entityId, id),
    ));

    const files = await tx.select().from(attachments).where(and(
      eq(attachments.orgId, orgId), eq(attachments.entityType, kind), eq(attachments.entityId, id),
    ));
    await tx.delete(attachments).where(and(
      eq(attachments.orgId, orgId), eq(attachments.entityType, kind), eq(attachments.entityId, id),
    ));

    await tx.delete(table).where(and(eq(table.orgId, orgId), eq(table.id, id)));

    const label = "name" in row ? String(row.name) : "description" in row ? String(row.description) : kind;
    return { label, attachmentsToRemove: files.map((f) => f.storageKey) };
  });
}
