"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/server/context";
import {
  addProductionItem, archiveCustomer, archiveEvent, archiveExpense, archiveProduct,
  createCustomer, createEvent, createExpense, createProduct, removeCustomerPrice,
  removeProductionItem, setCustomerPrice, updateCustomer, updateEvent, updateExpense,
  updateProduct, updateProductionItem,
} from "@/server/domain/entities";
import { fail } from "./result";
import {
  BULK_LIMIT, canDelete, deleteManyPermanently, deletePermanently, setArchived, setArchivedMany,
} from "@/server/domain/deletion";
import { storage } from "@/server/storage";
import { z as zod } from "zod";

// ───────── customers

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().nullable().optional(),
  email: z.string().email("Enter a valid email").nullable().optional().or(z.literal("")),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export async function createCustomerAction(input: unknown) {
  try {
    const ctx = await requireCapability("customer:manage");
    const row = await createCustomer({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, customerSchema.parse(input));
    revalidatePath("/customers"); revalidatePath("/orders");
    return { ok: true as const, data: { id: row.id, name: row.name } };
  } catch (error) { return fail(error); }
}

export async function updateCustomerAction(id: string, input: unknown) {
  try {
    const ctx = await requireCapability("customer:manage");
    await updateCustomer({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id, customerSchema.parse(input));
    revalidatePath("/customers"); revalidatePath(`/customers/${id}`);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function archiveCustomerAction(id: string) {
  try {
    const ctx = await requireCapability("customer:manage");
    await archiveCustomer({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id);
    revalidatePath("/customers");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function setCustomerPriceAction(input: unknown) {
  try {
    const ctx = await requireCapability("customer:price");
    const parsed = z.object({
      customerId: z.string().uuid(),
      productId: z.string().uuid().nullable(),
      priceMinor: z.coerce.number().int().nonnegative().nullable(),
      discountPercent: z.coerce.number().min(0).max(100).nullable(),
      note: z.string().nullable().optional(),
    }).parse(input);
    await setCustomerPrice({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, parsed);
    revalidatePath(`/customers/${parsed.customerId}`);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function removeCustomerPriceAction(id: string, customerId: string) {
  try {
    const ctx = await requireCapability("customer:price");
    await removeCustomerPrice({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

// ───────── products

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  defaultPriceMinor: z.coerce.number().int().nonnegative(),
  costMinor: z.coerce.number().int().nonnegative().nullable().optional(),
  unit: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export async function createProductAction(input: unknown) {
  try {
    const ctx = await requireCapability("product:manage");
    const row = await createProduct({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, productSchema.parse(input));
    revalidatePath("/products"); revalidatePath("/orders");
    return { ok: true as const, data: { id: row.id, name: row.name, defaultPriceMinor: row.defaultPriceMinor } };
  } catch (error) { return fail(error); }
}

export async function updateProductAction(id: string, input: unknown) {
  try {
    const ctx = await requireCapability("product:manage");
    await updateProduct({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id, productSchema.parse(input));
    revalidatePath("/products"); revalidatePath(`/products/${id}`);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function archiveProductAction(id: string) {
  try {
    const ctx = await requireCapability("product:manage");
    await archiveProduct({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id);
    revalidatePath("/products");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

// ───────── expenses

const expenseSchema = z.object({
  date: z.coerce.date(),
  description: z.string().min(1, "Describe the expense"),
  categoryId: z.string().uuid().nullable().optional(),
  amountMinor: z.coerce.number().int().nonnegative(),
  methodId: z.string().uuid().nullable().optional(),
  vendor: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export async function createExpenseAction(input: unknown) {
  try {
    const ctx = await requireCapability("expense:manage");
    const row = await createExpense({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, expenseSchema.parse(input));
    revalidatePath("/expenses"); revalidatePath("/dashboard"); revalidatePath("/analytics");
    return { ok: true as const, data: { id: row.id } };
  } catch (error) { return fail(error); }
}

export async function updateExpenseAction(id: string, input: unknown) {
  try {
    const ctx = await requireCapability("expense:manage");
    await updateExpense({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id, expenseSchema.parse(input));
    revalidatePath("/expenses"); revalidatePath("/analytics");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function archiveExpenseAction(id: string) {
  try {
    const ctx = await requireCapability("expense:manage");
    await archiveExpense({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id);
    revalidatePath("/expenses"); revalidatePath("/analytics");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

// ───────── events & production

const eventSchema = z.object({
  name: z.string().min(1, "Name is required"),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  budgetMinor: z.coerce.number().int().nonnegative().nullable().optional(),
  expectedSalesMinor: z.coerce.number().int().nonnegative().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export async function createEventAction(input: unknown) {
  try {
    const ctx = await requireCapability("event:manage");
    const row = await createEvent({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, eventSchema.parse(input));
    revalidatePath("/events"); revalidatePath("/dashboard");
    return { ok: true as const, data: { id: row.id } };
  } catch (error) { return fail(error); }
}

export async function updateEventAction(id: string, input: unknown) {
  try {
    const ctx = await requireCapability("event:manage");
    await updateEvent({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id, eventSchema.parse(input));
    revalidatePath("/events"); revalidatePath(`/events/${id}`);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function archiveEventAction(id: string) {
  try {
    const ctx = await requireCapability("event:manage");
    await archiveEvent({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, id);
    revalidatePath("/events");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

const productionSchema = z.object({
  productId: z.string().uuid().nullable(),
  productName: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  quantityPlanned: z.coerce.number().positive("Quantity to make must be greater than zero"),
  quantityCompleted: z.coerce.number().nonnegative().optional(),
  unitPriceMinor: z.coerce.number().int().nonnegative(),
  note: z.string().nullable().optional(),
});

export async function addProductionItemAction(eventId: string, input: unknown) {
  try {
    const ctx = await requireCapability("event:manage");
    await addProductionItem({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, eventId, productionSchema.parse(input));
    revalidatePath(`/events/${eventId}`); revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function updateProductionItemAction(eventId: string, itemId: string, input: unknown) {
  try {
    const ctx = await requireCapability("event:manage");
    await updateProductionItem(
      { orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, itemId,
      productionSchema.partial().parse(input),
    );
    revalidatePath(`/events/${eventId}`); revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function removeProductionItemAction(eventId: string, itemId: string) {
  try {
    const ctx = await requireCapability("event:manage");
    await removeProductionItem({ orgId: ctx.org.id, config: ctx.config, actor: ctx.actor }, itemId);
    revalidatePath(`/events/${eventId}`);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}


// ───────── archiving and deleting, for every record type

const kindSchema = zod.enum(["CUSTOMER", "PRODUCT", "EXPENSE", "EVENT"]);

/** Tells the UI up front whether a permanent delete is even possible, and why not. */
export async function checkDeletableAction(kind: unknown, id: unknown) {
  try {
    const ctx = await requireCapability("record:delete");
    const parsed = zod.object({ kind: kindSchema, id: zod.string().uuid() }).parse({ kind, id });
    const blocker = await canDelete(ctx.org.id, parsed.kind, parsed.id);
    return { ok: true as const, data: { deletable: !blocker, reason: blocker?.reason ?? null } };
  } catch (error) { return fail(error); }
}

export async function setArchivedAction(kind: unknown, id: unknown, archived: boolean) {
  try {
    const ctx = await requireCapability("record:archive");
    const parsed = zod.object({ kind: kindSchema, id: zod.string().uuid() }).parse({ kind, id });
    await setArchived({ orgId: ctx.org.id, actor: ctx.actor, kind: parsed.kind, id: parsed.id, archived });

    for (const path of ["/customers", "/products", "/expenses", "/events", "/dashboard", "/analytics"]) {
      revalidatePath(path);
    }
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function deleteRecordAction(kind: unknown, id: unknown, confirmation: string, expected: string) {
  try {
    const ctx = await requireCapability("record:delete");
    const parsed = zod.object({ kind: kindSchema, id: zod.string().uuid() }).parse({ kind, id });

    // Checked here, not only in the dialog, so the confirmation cannot be skipped.
    if (confirmation.trim().toLowerCase() !== expected.trim().toLowerCase()) {
      return { ok: false as const, error: `Type ${expected} exactly to confirm.` };
    }

    const result = await deletePermanently({ orgId: ctx.org.id, actor: ctx.actor, kind: parsed.kind, id: parsed.id });
    for (const key of result.attachmentsToRemove) {
      await storage().remove(key).catch(() => undefined);
    }

    for (const path of ["/customers", "/products", "/expenses", "/events", "/dashboard", "/analytics"]) {
      revalidatePath(path);
    }
    return { ok: true as const, data: { label: result.label } };
  } catch (error) { return fail(error); }
}

export async function bulkSetArchivedAction(kind: unknown, ids: string[], archived: boolean) {
  try {
    const ctx = await requireCapability("record:archive");
    const parsedKind = kindSchema.parse(kind);
    const parsedIds = zod.array(zod.string().uuid()).max(BULK_LIMIT).parse(ids);

    // One statement for the lot, rather than one round trip per record.
    const result = await setArchivedMany({
      orgId: ctx.org.id, actor: ctx.actor, kind: parsedKind, ids: parsedIds, archived,
    });

    for (const path of ["/customers", "/products", "/expenses", "/events", "/dashboard", "/analytics"]) {
      revalidatePath(path);
    }
    return { ok: true as const, data: { count: result.count } };
  } catch (error) { return fail(error); }
}

/**
 * Deletes what it can and reports what it could not, rather than failing the
 * whole batch on the first record that something still depends on. Tidying up
 * fifty duplicates should not stop dead because one of them has an order.
 */
export async function bulkDeleteRecordsAction(kind: unknown, ids: string[]) {
  try {
    const ctx = await requireCapability("record:delete");
    const parsedKind = kindSchema.parse(kind);
    const parsedIds = zod.array(zod.string().uuid()).max(BULK_LIMIT, `Select at most ${BULK_LIMIT} at a time.`).parse(ids);

    // Dependency checks and deletions happen set-at-a-time in one transaction:
    // a fixed number of queries however many records are selected.
    const result = await deleteManyPermanently({
      orgId: ctx.org.id, actor: ctx.actor, kind: parsedKind, ids: parsedIds,
    });

    // Files are cleaned up after the transaction commits; a failed unlink must
    // not undo a successful delete.
    for (const key of result.attachmentsToRemove) {
      await storage().remove(key).catch(() => undefined);
    }

    for (const path of ["/customers", "/products", "/expenses", "/events", "/dashboard", "/analytics"]) {
      revalidatePath(path);
    }
    return {
      ok: true as const,
      data: { deleted: result.deleted, skipped: result.skipped, firstReason: result.firstReason },
    };
  } catch (error) { return fail(error); }
}
