"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/server/context";
import {
  ORDER_BULK_LIMIT, applyCredit, archiveManyOrders, archiveOrder, changeOrderStatus, changeStatusMany,
  createOrder, deleteManyOrders, deleteOrderPermanently, getCustomerCredit, priceItems,
  recordPayment, restoreOrder, updateOrder, voidPayment,
} from "@/server/domain/orders";
import { storage } from "@/server/storage";
import { computeLine } from "@/server/domain/pricing";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { fail } from "./result";

const itemSchema = z.object({
  productId: z.string().uuid().nullable(),
  productName: z.string().optional(),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  unitPriceMinor: z.coerce.number().int().nonnegative().nullable().optional(),
  discountMinor: z.coerce.number().int().nonnegative().optional(),
  note: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const orderSchema = z.object({
  customerId: z.string().uuid().nullable(),
  orderDate: z.coerce.date(),
  deliveryByDate: z.coerce.date().nullable().optional(),
  deliveryTime: z.string().nullable().optional(),
  requestedDate: z.coerce.date().nullable().optional(),
  internalDeadline: z.coerce.date().nullable().optional(),
  statusId: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
  internalNote: z.string().nullable().optional(),
  customerNote: z.string().nullable().optional(),
  discountType: z.enum(["AMOUNT", "PERCENT"]).optional(),
  discountValue: z.coerce.number().nonnegative().optional(),
  additionalChargesMinor: z.coerce.number().int().nonnegative().optional(),
  items: z.array(itemSchema).min(1, "Add at least one item"),
  customFields: z.record(z.string(), z.unknown()).optional(),
  advance: z.object({
    amountMinor: z.coerce.number().int().positive(),
    methodId: z.string().uuid().nullable(),
    paidAt: z.coerce.date().optional(),
  }).nullable().optional(),
});

function revalidateOrderViews(orderId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/orders");
  revalidatePath("/payments");
  revalidatePath("/analytics");
  revalidatePath("/customers");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

export async function createOrderAction(input: unknown) {
  try {
    const ctx = await requireCapability("order:create");
    const parsed = orderSchema.parse(input);
    const order = await createOrder({
      orgId: ctx.org.id, config: ctx.config, actor: ctx.actor,
      input: parsed, advance: parsed.advance ?? null,
    });
    revalidateOrderViews(order.id);
    return { ok: true as const, data: { id: order.id, number: order.number } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateOrderAction(orderId: string, input: unknown) {
  try {
    const ctx = await requireCapability("order:update");
    const parsed = orderSchema.parse(input);
    const order = await updateOrder({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor, orderId, input: parsed });
    revalidateOrderViews(order.id);
    return { ok: true as const, data: { id: order.id, number: order.number } };
  } catch (error) {
    return fail(error);
  }
}

export async function changeStatusAction(orderId: string, statusId: string) {
  try {
    const ctx = await requireCapability("order:update");
    await changeOrderStatus({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor, orderId, statusId });
    revalidateOrderViews(orderId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function bulkChangeStatusAction(orderIds: string[], statusId: string) {
  try {
    const ctx = await requireCapability("order:update");
    const ids = z.array(z.string().uuid()).max(ORDER_BULK_LIMIT, `Select at most ${ORDER_BULK_LIMIT} at a time.`).parse(orderIds);

    const result = await changeStatusMany({
      orgId: ctx.org.id, config: ctx.config, actor: ctx.actor,
      orderIds: ids, statusId: z.string().uuid().parse(statusId),
    });

    revalidateOrderViews();
    return { ok: true as const, data: { count: result.count } };
  } catch (error) {
    return fail(error);
  }
}

const paymentSchema = z.object({
  orderId: z.string().uuid(),
  amountMinor: z.coerce.number().int().positive("Enter an amount"),
  methodId: z.string().uuid().nullable(),
  paidAt: z.coerce.date(),
  reference: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  kind: z.enum(["PAYMENT", "REFUND"]).optional(),
});

export async function recordPaymentAction(input: unknown) {
  try {
    const ctx = await requireCapability("payment:create");
    const parsed = paymentSchema.parse(input);
    const result = await recordPayment({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor, ...parsed });
    revalidateOrderViews(parsed.orderId);
    return {
      ok: true as const,
      data: {
        balanceMinor: result.balanceMinor, status: result.status,
        flag: result.flag, excessMinor: result.excessMinor, creditMinor: result.creditMinor,
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function customerCreditAction(customerId: string) {
  try {
    const ctx = await requireCapability("dashboard:view");
    const creditMinor = await getCustomerCredit(db, ctx.org.id, customerId);
    return { ok: true as const, data: { creditMinor } };
  } catch (error) { return fail(error); }
}

export async function applyCreditAction(orderId: unknown, amountMinor: unknown) {
  try {
    const ctx = await requireCapability("payment:create");
    const parsed = z.object({
      orderId: z.string().uuid(),
      amountMinor: z.coerce.number().int().positive("Enter an amount"),
    }).parse({ orderId, amountMinor });

    const result = await applyCredit({
      orgId: ctx.org.id, config: ctx.config, actor: ctx.actor,
      orderId: parsed.orderId, amountMinor: parsed.amountMinor,
    });
    revalidateOrderViews(parsed.orderId);
    return { ok: true as const, data: result };
  } catch (error) { return fail(error); }
}

export async function voidPaymentAction(paymentId: string, reason: string) {
  try {
    const ctx = await requireCapability("payment:void");
    await voidPayment({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor, paymentId, reason: reason || "Voided" });
    revalidateOrderViews();
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function archiveOrderAction(orderId: string) {
  try {
    const ctx = await requireCapability("order:archive");
    await archiveOrder({ orgId: ctx.org.id, actor: ctx.actor, orderId });
    revalidateOrderViews(orderId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function bulkArchiveOrdersAction(orderIds: string[], archived = true) {
  try {
    const ctx = await requireCapability("order:archive");
    const ids = z.array(z.string().uuid()).max(ORDER_BULK_LIMIT, `Select at most ${ORDER_BULK_LIMIT} at a time.`).parse(orderIds);

    const result = await archiveManyOrders({ orgId: ctx.org.id, actor: ctx.actor, orderIds: ids, archived });

    revalidateOrderViews();
    return { ok: true as const, data: { count: result.count } };
  } catch (error) { return fail(error); }
}

/**
 * Bulk deletion. Selecting the rows is the confirmation here — typing every
 * order number back would be theatre, not safety.
 */
export async function bulkDeleteOrdersAction(orderIds: string[]) {
  try {
    const ctx = await requireCapability("order:delete");
    const ids = z.array(z.string().uuid()).max(ORDER_BULK_LIMIT, `Select at most ${ORDER_BULK_LIMIT} at a time.`).parse(orderIds);

    const result = await deleteManyOrders({ orgId: ctx.org.id, actor: ctx.actor, orderIds: ids });
    for (const key of result.attachmentsToRemove) {
      await storage().remove(key).catch(() => undefined);
    }

    revalidateOrderViews();
    return { ok: true as const, data: { deleted: result.deleted } };
  } catch (error) { return fail(error); }
}

export async function restoreOrderAction(orderId: string) {
  try {
    const ctx = await requireCapability("order:archive");
    await restoreOrder({ orgId: ctx.org.id, actor: ctx.actor, orderId });
    revalidateOrderViews(orderId);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

/**
 * Permanent deletion, guarded by typing the order number back. The confirmation
 * is checked on the server, not merely in the dialog, so it cannot be skipped.
 */
export async function deleteOrderAction(orderId: string, confirmation: string) {
  try {
    const ctx = await requireCapability("order:delete");
    const parsed = z.object({
      orderId: z.string().uuid(),
      confirmation: z.string().min(1),
    }).parse({ orderId, confirmation });

    const [order] = await db.select({ number: orders.number }).from(orders)
      .where(and(eq(orders.orgId, ctx.org.id), eq(orders.id, parsed.orderId))).limit(1);
    if (!order) return { ok: false as const, error: "That order no longer exists." };

    if (parsed.confirmation.trim().toLowerCase() !== order.number.toLowerCase()) {
      return { ok: false as const, error: `Type ${order.number} exactly to confirm.` };
    }

    const result = await deleteOrderPermanently({ orgId: ctx.org.id, actor: ctx.actor, orderId: parsed.orderId });

    // Files go after the transaction commits: a failed unlink must not roll back
    // a successful deletion, it just leaves an orphan blob.
    for (const key of result.attachmentsToRemove) {
      await storage().remove(key).catch(() => undefined);
    }

    revalidateOrderViews();
    return { ok: true as const, data: { number: result.number } };
  } catch (error) { return fail(error); }
}

/**
 * Live price preview for the order form. The form NEVER computes a price
 * itself — it asks the same engine the server will use when saving.
 */
export async function previewPricesAction(customerId: string | null, items: unknown) {
  try {
    const ctx = await requireCapability("order:create");
    const parsed = z.array(itemSchema).parse(items);
    const priced = await priceItems(db, ctx.org.id, ctx.config, customerId, parsed);
    return {
      ok: true as const,
      data: priced.map((p) => ({
        productId: p.productId,
        unitPriceMinor: p.unitPriceMinor,
        priceSource: p.priceSource,
        lineTotalMinor: computeLine({
          quantity: p.quantity, unitPriceMinor: p.unitPriceMinor, discountMinor: p.discountMinor,
        }).lineTotalMinor,
      })),
    };
  } catch (error) {
    return fail(error);
  }
}
