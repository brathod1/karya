import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, type Exec } from "@/server/db";
import {
  activityEntries, attachments, auditLogs, customFieldValues, customerPrices, customers, orderItems, orders,
  paymentMethods, payments, products, statusDefinitions,
  type Order, type StatusDefinition,
} from "@/server/db/schema";
import { computeLine, computeOrderTotals, resolveUnitPrice, type PriceSource } from "./pricing";
import { creditBalance, derivePaymentStatus, paidTotal, validatePayment } from "./payments";
import { allocateNumber } from "./numbering";
import { logActivity, logAudit, type Actor } from "./audit";
import { loadFieldDefs, saveCustomFieldValues } from "./fields";
import { parseLineAttributes, type LineAttributes } from "./lineAttributes";
import { defaultOrderStatus, type OrgConfig } from "./config";
import { mustExist } from "@/server/db/tenant";

/**
 * Creating an order is a business workflow, not a row insert. One transaction:
 * allocate number → resolve prices → create items with immutable snapshots →
 * compute totals → record any advance → derive payment status → write timeline
 * and audit entries.
 */

export type OrderItemInput = {
  productId: string | null;
  /** Used when no product is selected (a free-text line). */
  productName?: string;
  quantity: number;
  /** null/undefined = let the pricing engine decide. A number = explicit override. */
  unitPriceMinor?: number | null;
  discountMinor?: number;
  note?: string | null;
  /** Colour, material, country… whatever this business configured. */
  attributes?: Record<string, unknown>;
};

export type OrderInput = {
  customerId: string | null;
  orderDate: Date;
  deliveryByDate?: Date | null;
  deliveryTime?: string | null;
  requestedDate?: Date | null;
  internalDeadline?: Date | null;
  statusId?: string | null;
  note?: string | null;
  internalNote?: string | null;
  customerNote?: string | null;
  discountType?: "AMOUNT" | "PERCENT";
  discountValue?: number;
  additionalChargesMinor?: number;
  items: OrderItemInput[];
  customFields?: Record<string, unknown>;
};

export type AdvanceInput = { amountMinor: number; methodId: string | null; paidAt?: Date; reference?: string | null };

type PricedItem = {
  productId: string | null;
  productNameSnapshot: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  /** Snapshot of quantity × unit − line discount. What analytics sums. */
  lineTotalMinor: number;
  priceSource: PriceSource;
  note: string | null;
  attributes: LineAttributes | null;
  sortOrder: number;
};

/** Resolves the price of every line through the pricing engine. Never inline this. */
export async function priceItems(
  tx: Exec, orgId: string, config: OrgConfig, customerId: string | null, items: OrderItemInput[], on = new Date(),
): Promise<PricedItem[]> {
  const attributeDefs = config.fieldDefs.filter((d) => d.entityType === "ORDER_ITEM");
  const productIds = items.map((i) => i.productId).filter((v): v is string => !!v);

  const productRows = productIds.length
    ? await tx.select().from(products).where(and(eq(products.orgId, orgId), inArray(products.id, productIds)))
    : [];
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const rules = customerId
    ? await tx.select().from(customerPrices).where(and(eq(customerPrices.orgId, orgId), eq(customerPrices.customerId, customerId)))
    : [];

  return items.map((item, index) => {
    const product = item.productId ? productById.get(item.productId) : undefined;
    if (item.productId && !product) {
      throw new Error("One of the selected products no longer exists.");
    }

    const resolved = resolveUnitPrice({
      productDefaultMinor: product?.defaultPriceMinor ?? 0,
      customerRules: rules.map((r) => ({
        productId: r.productId, priceMinor: r.priceMinor,
        discountPercent: r.discountPercent, validFrom: r.validFrom, validTo: r.validTo,
      })),
      productId: item.productId,
      overrideMinor: item.unitPriceMinor ?? null,
      enableCustomerSpecificPricing: config.settings.pricing.enableCustomerSpecificPricing,
      on,
    });

    const name = product?.name ?? item.productName?.trim();
    if (!name) throw new Error("Every line needs a product or a description.");
    if (!(item.quantity > 0)) throw new Error(`Quantity for "${name}" must be greater than zero.`);

    const parsedAttributes = parseLineAttributes(attributeDefs, item.attributes);
    if (!parsedAttributes.ok) throw new Error(`"${name}": ${parsedAttributes.error}`);

    const discountMinor = Math.max(item.discountMinor ?? 0, 0);
    return {
      productId: item.productId,
      productNameSnapshot: name,
      quantity: item.quantity,
      unitPriceMinor: resolved.unitPriceMinor,
      discountMinor,
      // The snapshot analytics sums. Was silently left at the column default of
      // 0 by this path — the totals on the order were right, but every line
      // (and Top products) showed ₹0.
      lineTotalMinor: computeLine({
        quantity: item.quantity, unitPriceMinor: resolved.unitPriceMinor, discountMinor,
      }).lineTotalMinor,
      priceSource: item.productId ? resolved.source : "MANUAL",
      note: item.note ?? null,
      attributes: parsedAttributes.attributes,
      sortOrder: index,
    };
  });
}

function totalsFor(config: OrgConfig, priced: PricedItem[], input: OrderInput) {
  return computeOrderTotals({
    lines: priced.map((p) => ({ quantity: p.quantity, unitPriceMinor: p.unitPriceMinor, discountMinor: p.discountMinor })),
    discountType: input.discountType ?? "AMOUNT",
    discountValue: config.settings.pricing.enableDiscounts ? input.discountValue ?? 0 : 0,
    additionalChargesMinor: config.settings.pricing.enableAdditionalCharges ? input.additionalChargesMinor ?? 0 : 0,
    taxEnabled: config.settings.pricing.enableTax,
    taxRatePercent: config.settings.pricing.taxRatePercent,
    taxInclusive: config.settings.pricing.taxInclusive,
  });
}

/**
 * Foreign keys arriving from a client are UUIDs — shape-valid but not proof of
 * ownership. Reads are org-scoped, so a foreign id cannot leak data, but it
 * could still corrupt a row. Every externally supplied id is checked here.
 */
async function assertCustomerInOrg(tx: Exec, orgId: string, customerId: string | null | undefined) {
  if (!customerId) return;
  const [row] = await tx.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId))).limit(1);
  mustExist(row, "Customer");
}

async function assertMethodInOrg(tx: Exec, orgId: string, methodId: string | null | undefined) {
  if (!methodId) return;
  const [row] = await tx.select({ id: paymentMethods.id }).from(paymentMethods)
    .where(and(eq(paymentMethods.orgId, orgId), eq(paymentMethods.id, methodId))).limit(1);
  mustExist(row, "Payment method");
}

function resolveStatus(config: OrgConfig, statusId: string | null | undefined): StatusDefinition {
  const chosen = statusId ? config.orderStatuses.find((s) => s.id === statusId) : undefined;
  const status = chosen ?? defaultOrderStatus(config);
  if (!status) throw new Error("No order statuses are configured. Add one in Settings → Statuses.");
  return status;
}

export async function createOrder(args: {
  orgId: string; config: OrgConfig; actor: Actor; input: OrderInput; advance?: AdvanceInput | null; source?: string;
}): Promise<Order> {
  const { orgId, config, actor, input } = args;
  if (input.items.length === 0) throw new Error("Add at least one item to the order.");
  if (config.settings.orders.requireCustomer && !input.customerId) throw new Error(`A ${config.t("customer").toLowerCase()} is required.`);
  if (config.settings.orders.requireDeliveryDate && !input.deliveryByDate) throw new Error("A delivery date is required.");

  return db.transaction(async (tx) => {
    await assertCustomerInOrg(tx, orgId, input.customerId);
    if (args.advance) await assertMethodInOrg(tx, orgId, args.advance.methodId);

    const priced = await priceItems(tx, orgId, config, input.customerId, input.items, input.orderDate);
    const totals = totalsFor(config, priced, input);
    const status = resolveStatus(config, input.statusId);
    const number = await allocateNumber(tx, orgId, "ORDER", input.orderDate);

    const [order] = await tx.insert(orders).values({
      orgId,
      number,
      customerId: input.customerId,
      orderDate: input.orderDate,
      deliveryByDate: input.deliveryByDate ?? null,
      deliveryTime: input.deliveryTime ?? null,
      requestedDate: input.requestedDate ?? null,
      internalDeadline: input.internalDeadline ?? null,
      statusId: status.id,
      note: input.note ?? null,
      internalNote: input.internalNote ?? null,
      customerNote: input.customerNote ?? null,
      discountType: input.discountType ?? "AMOUNT",
      discountValue: input.discountValue ?? 0,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      additionalChargesMinor: totals.additionalChargesMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
      paidMinor: 0,
      paymentStatus: totals.totalMinor === 0 ? "PAID" : "UNPAID",
      completedAt: status.isCompleted ? new Date() : null,
      source: args.source ?? "manual",
      createdByUserId: actor.userId,
    }).returning();

    await tx.insert(orderItems).values(priced.map((p) => ({ ...p, orgId, orderId: order.id })));

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "ORDER");
      await saveCustomFieldValues(tx, orgId, "ORDER", order.id, defs, input.customFields);
    }

    await logActivity(tx, {
      orgId, entityType: "ORDER", entityId: order.id, actor,
      type: "order.created", message: `${config.t("order")} ${number} created`,
      meta: { totalMinor: totals.totalMinor, items: priced.length },
    });

    if (args.advance && args.advance.amountMinor > 0) {
      await addPaymentInTx(tx, {
        orgId, config, actor, orderId: order.id,
        amountMinor: args.advance.amountMinor,
        methodId: args.advance.methodId,
        paidAt: args.advance.paidAt ?? input.orderDate,
        reference: args.advance.reference ?? null,
        note: "Advance",
        customerId: input.customerId,
      });
    }

    await logAudit(tx, { orgId, actor, action: "order.create", entityType: "Order", entityId: order.id, after: { number, totalMinor: totals.totalMinor } });

    const [fresh] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return fresh;
  });
}

export async function updateOrder(args: {
  orgId: string; config: OrgConfig; actor: Actor; orderId: string; input: OrderInput;
}): Promise<Order> {
  const { orgId, config, actor, orderId, input } = args;
  if (input.items.length === 0) throw new Error("An order must have at least one item.");

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(orders).where(and(eq(orders.orgId, orgId), eq(orders.id, orderId))).limit(1);
    mustExist(before, "Order");
    await assertCustomerInOrg(tx, orgId, input.customerId);

    const priced = await priceItems(tx, orgId, config, input.customerId, input.items, input.orderDate);
    const totals = totalsFor(config, priced, input);
    const status = resolveStatus(config, input.statusId ?? before.statusId);

    await tx.delete(orderItems).where(and(eq(orderItems.orgId, orgId), eq(orderItems.orderId, orderId)));
    await tx.insert(orderItems).values(priced.map((p) => ({ ...p, orgId, orderId })));

    const existingPayments = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)));
    const paid = paidTotal(existingPayments);

    await tx.update(orders).set({
      customerId: input.customerId,
      orderDate: input.orderDate,
      deliveryByDate: input.deliveryByDate ?? null,
      deliveryTime: input.deliveryTime ?? null,
      requestedDate: input.requestedDate ?? null,
      internalDeadline: input.internalDeadline ?? null,
      statusId: status.id,
      note: input.note ?? null,
      internalNote: input.internalNote ?? null,
      customerNote: input.customerNote ?? null,
      discountType: input.discountType ?? "AMOUNT",
      discountValue: input.discountValue ?? 0,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      additionalChargesMinor: totals.additionalChargesMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
      paidMinor: paid,
      paymentStatus: derivePaymentStatus(totals.totalMinor, paid),
      completedAt: status.isCompleted ? before.completedAt ?? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "ORDER");
      await saveCustomFieldValues(tx, orgId, "ORDER", orderId, defs, input.customFields);
    }

    await logActivity(tx, {
      orgId, entityType: "ORDER", entityId: orderId, actor,
      type: "order.updated", message: `${config.t("order")} updated`,
      meta: { totalMinor: totals.totalMinor },
    });
    await logAudit(tx, {
      orgId, actor, action: "order.update", entityType: "Order", entityId: orderId,
      before: { totalMinor: before.totalMinor, statusId: before.statusId },
      after: { totalMinor: totals.totalMinor, statusId: status.id },
    });

    const [fresh] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return fresh;
  });
}

export async function changeOrderStatus(args: {
  orgId: string; config: OrgConfig; actor: Actor; orderId: string; statusId: string;
}) {
  const { orgId, config, actor, orderId, statusId } = args;
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.orgId, orgId), eq(orders.id, orderId))).limit(1);
    mustExist(order, "Order");

    const [next] = await tx.select().from(statusDefinitions)
      .where(and(eq(statusDefinitions.orgId, orgId), eq(statusDefinitions.id, statusId))).limit(1);
    mustExist(next, "Status");

    const previous = config.orderStatuses.find((s) => s.id === order.statusId);

    await tx.update(orders).set({
      statusId: next.id,
      completedAt: next.isCompleted ? order.completedAt ?? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId));

    await logActivity(tx, {
      orgId, entityType: "ORDER", entityId: orderId, actor,
      type: "order.status", message: `Status changed to ${next.label}`,
      meta: { from: previous?.label ?? null, to: next.label },
    });
    await logAudit(tx, {
      orgId, actor, action: "order.status", entityType: "Order", entityId: orderId,
      before: { status: previous?.label ?? null }, after: { status: next.label },
    });
  });
}

/**
 * Archiving is the normal way to remove an order. It disappears from lists and
 * from every figure, but the record, its payments and its history all survive —
 * which is what you want the day someone asks what happened.
 */
export async function archiveOrder(args: { orgId: string; actor: Actor; orderId: string }) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders)
      .where(and(eq(orders.orgId, args.orgId), eq(orders.id, args.orderId))).limit(1);
    mustExist(order, "Order");

    await tx.update(orders).set({ archivedAt: new Date() }).where(eq(orders.id, args.orderId));
    await logActivity(tx, {
      orgId: args.orgId, actor: args.actor, entityType: "ORDER", entityId: args.orderId,
      type: "order.archived", message: `${order.number} archived`,
    });
    await logAudit(tx, {
      orgId: args.orgId, actor: args.actor, action: "order.archive",
      entityType: "Order", entityId: args.orderId, before: { archivedAt: null }, after: { archivedAt: new Date() },
    });
  });
}

export async function restoreOrder(args: { orgId: string; actor: Actor; orderId: string }) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders)
      .where(and(eq(orders.orgId, args.orgId), eq(orders.id, args.orderId))).limit(1);
    mustExist(order, "Order");

    await tx.update(orders).set({ archivedAt: null }).where(eq(orders.id, args.orderId));
    await logActivity(tx, {
      orgId: args.orgId, actor: args.actor, entityType: "ORDER", entityId: args.orderId,
      type: "order.restored", message: `${order.number} restored`,
    });
    await logAudit(tx, {
      orgId: args.orgId, actor: args.actor, action: "order.restore",
      entityType: "Order", entityId: args.orderId, after: { archivedAt: null },
    });
  });
}

/**
 * Set-at-a-time versions of the bulk operations.
 *
 * Looping the single-order functions meant a transaction and a handful of round
 * trips per order; fifty orders against a distant database took long enough for
 * the browser to give up mid-way, leaving the job half done. These cost a fixed
 * number of queries whatever the selection size.
 */
export const ORDER_BULK_LIMIT = 500;

export async function archiveManyOrders(args: { orgId: string; actor: Actor; orderIds: string[]; archived: boolean }) {
  const ids = args.orderIds.slice(0, ORDER_BULK_LIMIT);
  if (ids.length === 0) return { count: 0 };

  return db.transaction(async (tx) => {
    const archivedAt = args.archived ? new Date() : null;
    const updated = await tx.update(orders).set({ archivedAt })
      .where(and(eq(orders.orgId, args.orgId), inArray(orders.id, ids)))
      .returning({ id: orders.id, number: orders.number });

    if (updated.length > 0) {
      await tx.insert(auditLogs).values(updated.map((row) => ({
        orgId: args.orgId, actorUserId: args.actor.userId, actorName: args.actor.name,
        action: args.archived ? "order.archive" : "order.restore",
        entityType: "Order", entityId: row.id, after: { archivedAt } as never,
      })));
    }
    return { count: updated.length };
  });
}

export async function changeStatusMany(args: {
  orgId: string; config: OrgConfig; actor: Actor; orderIds: string[]; statusId: string;
}) {
  const ids = args.orderIds.slice(0, ORDER_BULK_LIMIT);
  if (ids.length === 0) return { count: 0 };

  const status = args.config.orderStatuses.find((s) => s.id === args.statusId);
  if (!status) throw new Error("That status does not belong to this workspace.");

  return db.transaction(async (tx) => {
    const updated = await tx.update(orders).set({
      statusId: status.id,
      completedAt: status.isCompleted ? new Date() : null,
      updatedAt: new Date(),
    })
      .where(and(eq(orders.orgId, args.orgId), inArray(orders.id, ids)))
      .returning({ id: orders.id });

    if (updated.length > 0) {
      await tx.insert(activityEntries).values(updated.map((row) => ({
        orgId: args.orgId, entityType: "ORDER" as const, entityId: row.id,
        type: "order.status", message: `Status changed to ${status.label}`,
        actorUserId: args.actor.userId, actorName: args.actor.name,
      })));
      await tx.insert(auditLogs).values(updated.map((row) => ({
        orgId: args.orgId, actorUserId: args.actor.userId, actorName: args.actor.name,
        action: "order.status", entityType: "Order", entityId: row.id,
        after: { status: status.label } as never,
      })));
    }
    return { count: updated.length };
  });
}

export async function deleteManyOrders(args: { orgId: string; actor: Actor; orderIds: string[] }) {
  const { orgId, actor } = args;
  const ids = args.orderIds.slice(0, ORDER_BULK_LIMIT);
  if (ids.length === 0) return { deleted: 0, attachmentsToRemove: [] as string[] };

  return db.transaction(async (tx) => {
    const rows = await tx.select().from(orders)
      .where(and(eq(orders.orgId, orgId), inArray(orders.id, ids)));
    if (rows.length === 0) return { deleted: 0, attachmentsToRemove: [] as string[] };

    const orderIds = rows.map((r) => r.id);
    const paymentRows = await tx.select().from(payments)
      .where(and(eq(payments.orgId, orgId), inArray(payments.orderId, orderIds)));

    await tx.insert(auditLogs).values(rows.map((row) => ({
      orgId, actorUserId: actor.userId, actorName: actor.name,
      action: "order.delete", entityType: "Order", entityId: row.id,
      before: { number: row.number, totalMinor: row.totalMinor, paidMinor: row.paidMinor } as never,
      after: null,
    })));

    // Credit ledger entries paired with these payments go too, so a customer's
    // credit ends up where it would have been had the order never existed.
    const paymentIds = paymentRows.map((p) => p.id);
    if (paymentIds.length > 0) {
      await tx.delete(payments).where(and(eq(payments.orgId, orgId), inArray(payments.linkedPaymentId, paymentIds)));
    }
    const linkedBack = paymentRows.map((p) => p.linkedPaymentId).filter((v): v is string => !!v);
    if (linkedBack.length > 0) {
      await tx.delete(payments).where(and(eq(payments.orgId, orgId), inArray(payments.id, linkedBack)));
    }

    await tx.delete(payments).where(and(eq(payments.orgId, orgId), inArray(payments.orderId, orderIds)));
    await tx.delete(customFieldValues).where(and(
      eq(customFieldValues.orgId, orgId), eq(customFieldValues.entityType, "ORDER"), inArray(customFieldValues.entityId, orderIds),
    ));
    await tx.delete(activityEntries).where(and(
      eq(activityEntries.orgId, orgId), eq(activityEntries.entityType, "ORDER"), inArray(activityEntries.entityId, orderIds),
    ));

    const files = await tx.select().from(attachments).where(and(
      eq(attachments.orgId, orgId), eq(attachments.entityType, "ORDER"), inArray(attachments.entityId, orderIds),
    ));
    await tx.delete(attachments).where(and(
      eq(attachments.orgId, orgId), eq(attachments.entityType, "ORDER"), inArray(attachments.entityId, orderIds),
    ));

    // Order items cascade from the order rows.
    await tx.delete(orders).where(and(eq(orders.orgId, orgId), inArray(orders.id, orderIds)));

    return { deleted: orderIds.length, attachmentsToRemove: files.map((f) => f.storageKey) };
  });
}

/**
 * Permanent deletion. For a genuine mistake — a test order, a duplicate — not
 * for tidying up real history.
 *
 * The full record is written into the audit log *before* anything is removed,
 * so the fact of the deletion and what was deleted both survive it. Payments go
 * with the order, and any credit movement they were half of goes with them, so
 * a customer's credit balance returns to what it would have been had the order
 * never existed.
 */
export async function deleteOrderPermanently(args: { orgId: string; actor: Actor; orderId: string }) {
  const { orgId, actor, orderId } = args;
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders)
      .where(and(eq(orders.orgId, orgId), eq(orders.id, orderId))).limit(1);
    mustExist(order, "Order");

    const items = await tx.select().from(orderItems).where(and(eq(orderItems.orgId, orgId), eq(orderItems.orderId, orderId)));
    const paymentRows = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)));

    await logAudit(tx, {
      orgId, actor, action: "order.delete", entityType: "Order", entityId: orderId,
      before: {
        number: order.number, customerId: order.customerId, totalMinor: order.totalMinor,
        paidMinor: order.paidMinor, orderDate: order.orderDate,
        items: items.map((i) => ({ name: i.productNameSnapshot, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor })),
        payments: paymentRows.map((p) => ({ amountMinor: p.amountMinor, paidAt: p.paidAt, kind: p.kind })),
      },
      after: null,
    });

    // Credit rows are linked to the payments they came from or paid for; without
    // this the customer's credit balance would be left wrong in either direction.
    const paymentIds = paymentRows.map((p) => p.id);
    if (paymentIds.length > 0) {
      await tx.delete(payments).where(and(eq(payments.orgId, orgId), inArray(payments.linkedPaymentId, paymentIds)));
    }
    for (const payment of paymentRows) {
      if (payment.linkedPaymentId) {
        await tx.delete(payments).where(and(eq(payments.orgId, orgId), eq(payments.id, payment.linkedPaymentId)));
      }
    }

    await tx.delete(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)));
    await tx.delete(customFieldValues).where(and(
      eq(customFieldValues.orgId, orgId), eq(customFieldValues.entityType, "ORDER"), eq(customFieldValues.entityId, orderId),
    ));
    await tx.delete(activityEntries).where(and(
      eq(activityEntries.orgId, orgId), eq(activityEntries.entityType, "ORDER"), eq(activityEntries.entityId, orderId),
    ));

    // Order items cascade from the order row itself.
    await tx.delete(orders).where(and(eq(orders.orgId, orgId), eq(orders.id, orderId)));

    return { number: order.number, attachmentsToRemove: await attachmentKeys(tx, orgId, orderId) };
  });
}

async function attachmentKeys(tx: Exec, orgId: string, orderId: string) {
  const rows = await tx.select().from(attachments).where(and(
    eq(attachments.orgId, orgId), eq(attachments.entityType, "ORDER"), eq(attachments.entityId, orderId),
  ));
  await tx.delete(attachments).where(and(
    eq(attachments.orgId, orgId), eq(attachments.entityType, "ORDER"), eq(attachments.entityId, orderId),
  ));
  return rows.map((r) => r.storageKey);
}

/**
 * Records a payment inside an existing transaction. Exported so that
 * `createOrder` can register an advance atomically with the order itself.
 */
export async function addPaymentInTx(tx: Exec, args: {
  orgId: string; config: OrgConfig; actor: Actor; orderId: string;
  amountMinor: number; methodId: string | null; paidAt: Date;
  reference?: string | null; note?: string | null; customerId?: string | null;
  kind?: "PAYMENT" | "REFUND";
}) {
  const { orgId, config, actor, orderId } = args;

  const [order] = await tx.select().from(orders).where(and(eq(orders.orgId, orgId), eq(orders.id, orderId))).limit(1);
  mustExist(order, "Order");
  await assertMethodInOrg(tx, orgId, args.methodId);

  const existing = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)));
  const alreadyPaid = paidTotal(existing);

  const check = validatePayment({
    amountMinor: args.amountMinor,
    totalMinor: order.totalMinor,
    alreadyPaidMinor: alreadyPaid,
    policy: config.settings.payments.overpaymentPolicy,
    kind: args.kind ?? "PAYMENT",
  });
  if (!check.ok) throw new Error(check.reason);

  const customerId = args.customerId ?? order.customerId;

  // Under the CREDIT policy the payment is split: the part that settles the
  // order stays on the order, and the excess becomes customer credit. The order
  // therefore lands exactly on PAID rather than OVERPAID.
  // Never send a negative amount to the order: if the order is already settled
  // (or somehow overpaid), the whole payment becomes credit rather than a
  // payment row that is really a refund.
  const keepAsCredit = check.flag === "CREDIT" ? Math.min(check.excessMinor, args.amountMinor) : 0;
  const appliedToOrder = Math.max(args.amountMinor - keepAsCredit, 0);

  if (keepAsCredit > 0 && !customerId) {
    throw new Error("Credit can only be kept for a named customer.");
  }
  if (appliedToOrder === 0 && keepAsCredit === 0) {
    throw new Error("Nothing to record.");
  }

  // A zero-amount payment row would violate the database's own check constraint,
  // which is exactly the case where the order had nothing left outstanding.
  const [payment] = appliedToOrder > 0
    ? await tx.insert(payments).values({
        orgId,
        orderId,
        customerId,
        amountMinor: appliedToOrder,
        paidAt: args.paidAt,
        methodId: args.methodId,
        reference: args.reference ?? null,
        note: args.note ?? null,
        kind: args.kind ?? "PAYMENT",
        createdByUserId: actor.userId,
      }).returning()
    : [null];

  if (keepAsCredit > 0) {
    await tx.insert(payments).values({
      orgId,
      orderId: null,
      customerId,
      amountMinor: keepAsCredit,
      paidAt: args.paidAt,
      methodId: args.methodId,
      reference: args.reference ?? null,
      note: `Credit from ${order.number}`,
      kind: "CREDIT",
      linkedPaymentId: payment?.id ?? null,
      createdByUserId: actor.userId,
    });
  }

  const refreshed = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)));
  const paid = paidTotal(refreshed);
  const status = derivePaymentStatus(order.totalMinor, paid);

  const update: Partial<typeof orders.$inferInsert> = { paidMinor: paid, paymentStatus: status, updatedAt: new Date() };

  // Config-driven: optionally advance the order to the first completed status when fully paid.
  if (config.settings.payments.autoAdvanceStatusOnFullPayment && status === "PAID") {
    const completed = config.orderStatuses.find((s) => s.isCompleted && s.isActive);
    if (completed && completed.id !== order.statusId) {
      update.statusId = completed.id;
      update.completedAt = new Date();
    }
  }

  await tx.update(orders).set(update).where(eq(orders.id, orderId));

  const label = (args.kind ?? "PAYMENT") === "REFUND" ? "refunded" : "received";
  await logActivity(tx, {
    orgId, entityType: "ORDER", entityId: orderId, actor,
    type: "payment.recorded",
    message: keepAsCredit > 0
      ? `${config.money(Math.abs(args.amountMinor))} ${label} — ${config.money(keepAsCredit)} kept as credit`
      : `${config.money(Math.abs(args.amountMinor))} ${label}`,
    meta: { paymentId: payment?.id ?? null, balanceMinor: order.totalMinor - paid, flag: check.flag, creditMinor: keepAsCredit },
  });
  await logAudit(tx, {
    orgId, actor, action: "payment.create", entityType: "Payment", entityId: payment?.id ?? orderId,
    after: { orderId, amountMinor: args.amountMinor, appliedToOrder, keepAsCredit, paidMinor: paid, paymentStatus: status },
  });

  return {
    payment, paidMinor: paid, balanceMinor: order.totalMinor - paid,
    status, flag: check.flag, excessMinor: check.excessMinor, creditMinor: keepAsCredit,
  };
}

/** A customer's unspent credit: the sum of their CREDIT ledger rows. */
export async function getCustomerCredit(tx: Exec, orgId: string, customerId: string): Promise<number> {
  const rows = await tx.select().from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.customerId, customerId), eq(payments.kind, "CREDIT")));
  return creditBalance(rows);
}

/**
 * Spends existing credit against an order: a real payment on the order, and a
 * matching negative row on the credit ledger so the two can never disagree.
 */
export async function applyCredit(args: {
  orgId: string; config: OrgConfig; actor: Actor; orderId: string; amountMinor: number;
}) {
  const { orgId, config, actor, orderId } = args;
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.orgId, orgId), eq(orders.id, orderId))).limit(1);
    mustExist(order, "Order");
    if (!order.customerId) throw new Error("This order has no customer, so there is no credit to use.");

    const available = await getCustomerCredit(tx, orgId, order.customerId);
    const existing = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)));
    const outstanding = order.totalMinor - paidTotal(existing);

    const amount = Math.min(args.amountMinor, available, outstanding);
    if (amount <= 0) {
      throw new Error(available <= 0 ? "There is no credit to use." : "This order has nothing outstanding.");
    }

    const [creditPayment] = await tx.insert(payments).values({
      orgId, orderId, customerId: order.customerId, amountMinor: amount,
      paidAt: new Date(), methodId: null, note: "Paid from credit",
      kind: "PAYMENT", createdByUserId: actor.userId,
    }).returning();

    await tx.insert(payments).values({
      orgId, orderId: null, customerId: order.customerId, amountMinor: -amount,
      paidAt: new Date(), methodId: null, note: `Credit used on ${order.number}`,
      kind: "CREDIT", linkedPaymentId: creditPayment.id, createdByUserId: actor.userId,
    });

    const refreshed = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)));
    const paid = paidTotal(refreshed);
    const status = derivePaymentStatus(order.totalMinor, paid);

    const update: Partial<typeof orders.$inferInsert> = {
      paidMinor: paid, paymentStatus: status, updatedAt: new Date(),
    };
    // Same config-driven rule as an ordinary payment.
    if (config.settings.payments.autoAdvanceStatusOnFullPayment && status === "PAID") {
      const completed = config.orderStatuses.find((s) => s.isCompleted && s.isActive);
      if (completed && completed.id !== order.statusId) {
        update.statusId = completed.id;
        update.completedAt = new Date();
      }
    }
    await tx.update(orders).set(update).where(eq(orders.id, orderId));

    await logActivity(tx, {
      orgId, entityType: "ORDER", entityId: orderId, actor,
      type: "payment.credit", message: `${config.money(amount)} paid from credit`,
    });
    await logAudit(tx, {
      orgId, actor, action: "payment.credit", entityType: "Order", entityId: orderId,
      after: { amountMinor: amount, remainingCreditMinor: available - amount },
    });

    return { appliedMinor: amount, remainingCreditMinor: available - amount, balanceMinor: order.totalMinor - paid };
  });
}

export async function recordPayment(args: {
  orgId: string; config: OrgConfig; actor: Actor; orderId: string;
  amountMinor: number; methodId: string | null; paidAt: Date;
  reference?: string | null; note?: string | null; kind?: "PAYMENT" | "REFUND";
}) {
  return db.transaction((tx) => addPaymentInTx(tx, args));
}

export async function voidPayment(args: { orgId: string; config: OrgConfig; actor: Actor; paymentId: string; reason: string }) {
  const { orgId, config, actor, paymentId } = args;
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.id, paymentId))).limit(1);
    mustExist(payment, "Payment");
    if (payment.voidedAt) throw new Error("That payment has already been voided.");

    const voidedAt = new Date();
    await tx.update(payments).set({ voidedAt, voidReason: args.reason }).where(eq(payments.id, paymentId));

    /**
     * A credit movement is two rows: the money on the order and the matching
     * entry on the customer's credit ledger. Voiding one without the other
     * either destroys credit the customer is owed or invents credit from
     * nothing, so both halves go together.
     */
    const linked = await tx.select().from(payments).where(and(
      eq(payments.orgId, orgId),
      or(eq(payments.linkedPaymentId, paymentId), payment.linkedPaymentId ? eq(payments.id, payment.linkedPaymentId) : sql`false`),
    ));
    for (const sibling of linked) {
      if (sibling.id === paymentId || sibling.voidedAt) continue;
      await tx.update(payments).set({ voidedAt, voidReason: `${args.reason} (linked entry)` })
        .where(eq(payments.id, sibling.id));
    }

    if (payment.orderId) {
      const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
      const refreshed = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, payment.orderId)));
      const paid = paidTotal(refreshed);
      await tx.update(orders).set({
        paidMinor: paid, paymentStatus: derivePaymentStatus(order.totalMinor, paid), updatedAt: new Date(),
      }).where(eq(orders.id, payment.orderId));

      await logActivity(tx, {
        orgId, entityType: "ORDER", entityId: payment.orderId, actor,
        type: "payment.voided", message: `${config.money(payment.amountMinor)} payment voided — ${args.reason}`,
      });
    }

    await logAudit(tx, {
      orgId, actor, action: "payment.void", entityType: "Payment", entityId: paymentId,
      before: { voidedAt: null }, after: { voidedAt: new Date(), reason: args.reason },
    });
  });
}

/** Safety net: recompute the paidMinor cache from the payment rows. Run nightly. */
export async function reconcileOrderPayments(orgId: string, orderId: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.orgId, orgId), eq(orders.id, orderId))).limit(1);
    mustExist(order, "Order");
    const rows = await tx.select().from(payments).where(and(eq(payments.orgId, orgId), eq(payments.orderId, orderId)));
    const paid = paidTotal(rows);
    if (paid !== order.paidMinor) {
      await tx.update(orders).set({ paidMinor: paid, paymentStatus: derivePaymentStatus(order.totalMinor, paid) }).where(eq(orders.id, orderId));
    }
    return { corrected: paid !== order.paidMinor, paidMinor: paid };
  });
}
