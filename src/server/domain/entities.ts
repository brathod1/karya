import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  customerPrices, customers, eventProductionItems, events, expenses, products,
} from "@/server/db/schema";
import { allocateNumber } from "./numbering";
import { logActivity, logAudit, type Actor } from "./audit";
import { loadFieldDefs, saveCustomFieldValues } from "./fields";
import { validateCompletion } from "./events";
import { mustExist } from "@/server/db/tenant";
import { assertCategoryInOrg, assertMethodInOrg } from "./ownership";
import type { OrgConfig } from "./config";

type Base = { orgId: string; config: OrgConfig; actor: Actor };

// ───────────────────────────── customers

export type CustomerInput = {
  name: string; phone?: string | null; email?: string | null; address?: string | null;
  notes?: string | null; tags?: string[]; customFields?: Record<string, unknown>;
};

export async function createCustomer({ orgId, config, actor }: Base, input: CustomerInput) {
  return db.transaction(async (tx) => {
    const code = await allocateNumber(tx, orgId, "CUSTOMER");
    const [row] = await tx.insert(customers).values({
      orgId, code, name: input.name.trim(),
      phone: input.phone || null, email: input.email || null,
      address: input.address || null, notes: input.notes || null, tags: input.tags ?? [],
    }).returning();

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "CUSTOMER");
      await saveCustomFieldValues(tx, orgId, "CUSTOMER", row.id, defs, input.customFields);
    }
    await logActivity(tx, { orgId, actor, entityType: "CUSTOMER", entityId: row.id, type: "customer.created", message: `${config.t("customer")} ${row.name} added` });
    await logAudit(tx, { orgId, actor, action: "customer.create", entityType: "Customer", entityId: row.id, after: { code, name: row.name } });
    return row;
  });
}

export async function updateCustomer({ orgId, config, actor }: Base, id: string, input: CustomerInput) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(and(eq(customers.orgId, orgId), eq(customers.id, id))).limit(1);
    mustExist(before, config.t("customer"));

    const [row] = await tx.update(customers).set({
      name: input.name.trim(), phone: input.phone || null, email: input.email || null,
      address: input.address || null, notes: input.notes || null, tags: input.tags ?? before.tags,
      updatedAt: new Date(),
    }).where(eq(customers.id, id)).returning();

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "CUSTOMER");
      await saveCustomFieldValues(tx, orgId, "CUSTOMER", id, defs, input.customFields);
    }
    await logAudit(tx, { orgId, actor, action: "customer.update", entityType: "Customer", entityId: id, before: { name: before.name, phone: before.phone }, after: { name: row.name, phone: row.phone } });
    return row;
  });
}

export async function archiveCustomer({ orgId, actor }: Base, id: string) {
  return db.transaction(async (tx) => {
    await tx.update(customers).set({ archivedAt: new Date() }).where(and(eq(customers.orgId, orgId), eq(customers.id, id)));
    await logAudit(tx, { orgId, actor, action: "customer.archive", entityType: "Customer", entityId: id });
  });
}

// ───────────────────────────── customer-specific pricing

export async function setCustomerPrice({ orgId, actor }: Base, args: {
  customerId: string; productId: string | null; priceMinor: number | null; discountPercent: number | null; note?: string | null;
}) {
  return db.transaction(async (tx) => {
    // Shape-valid UUIDs are not proof of ownership — verify both ids belong to this org.
    const [customer] = await tx.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, args.customerId))).limit(1);
    mustExist(customer, "Customer");
    if (args.productId) {
      const [product] = await tx.select({ id: products.id }).from(products)
        .where(and(eq(products.orgId, orgId), eq(products.id, args.productId))).limit(1);
      mustExist(product, "Product");
    }

    const [row] = await tx.insert(customerPrices).values({
      orgId, customerId: args.customerId, productId: args.productId,
      priceMinor: args.priceMinor, discountPercent: args.discountPercent, note: args.note ?? null,
    }).onConflictDoUpdate({
      target: [customerPrices.orgId, customerPrices.customerId, customerPrices.productId],
      set: { priceMinor: args.priceMinor, discountPercent: args.discountPercent, note: args.note ?? null },
    }).returning();

    await logAudit(tx, { orgId, actor, action: "customer.price.set", entityType: "CustomerPrice", entityId: row.id, after: args });
    return row;
  });
}

export async function removeCustomerPrice({ orgId, actor }: Base, id: string) {
  return db.transaction(async (tx) => {
    await tx.delete(customerPrices).where(and(eq(customerPrices.orgId, orgId), eq(customerPrices.id, id)));
    await logAudit(tx, { orgId, actor, action: "customer.price.remove", entityType: "CustomerPrice", entityId: id });
  });
}

// ───────────────────────────── products

export type ProductInput = {
  name: string; description?: string | null; categoryId?: string | null;
  defaultPriceMinor: number; costMinor?: number | null; unit?: string;
  imageUrl?: string | null; notes?: string | null; isActive?: boolean;
  customFields?: Record<string, unknown>;
};

export async function createProduct({ orgId, config, actor }: Base, input: ProductInput) {
  return db.transaction(async (tx) => {
    await assertCategoryInOrg(tx, orgId, input.categoryId, "PRODUCT");
    const code = await allocateNumber(tx, orgId, "PRODUCT");
    const [row] = await tx.insert(products).values({
      orgId, code, name: input.name.trim(), description: input.description || null,
      categoryId: input.categoryId || null, defaultPriceMinor: Math.max(input.defaultPriceMinor, 0),
      costMinor: config.settings.pricing.enableCostTracking ? input.costMinor ?? null : null,
      unit: input.unit || "pcs", imageUrl: input.imageUrl || null, notes: input.notes || null,
      isActive: input.isActive ?? true,
    }).returning();

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "PRODUCT");
      await saveCustomFieldValues(tx, orgId, "PRODUCT", row.id, defs, input.customFields);
    }
    await logAudit(tx, { orgId, actor, action: "product.create", entityType: "Product", entityId: row.id, after: { code, name: row.name, defaultPriceMinor: row.defaultPriceMinor } });
    return row;
  });
}

export async function updateProduct({ orgId, config, actor }: Base, id: string, input: ProductInput) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(products).where(and(eq(products.orgId, orgId), eq(products.id, id))).limit(1);
    mustExist(before, config.t("product"));
    await assertCategoryInOrg(tx, orgId, input.categoryId, "PRODUCT");

    const [row] = await tx.update(products).set({
      name: input.name.trim(), description: input.description || null, categoryId: input.categoryId || null,
      defaultPriceMinor: Math.max(input.defaultPriceMinor, 0),
      costMinor: config.settings.pricing.enableCostTracking ? input.costMinor ?? null : before.costMinor,
      unit: input.unit || before.unit, imageUrl: input.imageUrl || null, notes: input.notes || null,
      isActive: input.isActive ?? before.isActive, updatedAt: new Date(),
    }).where(eq(products.id, id)).returning();

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "PRODUCT");
      await saveCustomFieldValues(tx, orgId, "PRODUCT", id, defs, input.customFields);
    }
    // Note: past orders are untouched. Order items hold their own price snapshot.
    await logAudit(tx, { orgId, actor, action: "product.update", entityType: "Product", entityId: id, before: { name: before.name, defaultPriceMinor: before.defaultPriceMinor }, after: { name: row.name, defaultPriceMinor: row.defaultPriceMinor } });
    return row;
  });
}

export async function archiveProduct({ orgId, actor }: Base, id: string) {
  return db.transaction(async (tx) => {
    // Soft delete only — historical orders must keep resolving this product.
    await tx.update(products).set({ archivedAt: new Date(), isActive: false }).where(and(eq(products.orgId, orgId), eq(products.id, id)));
    await logAudit(tx, { orgId, actor, action: "product.archive", entityType: "Product", entityId: id });
  });
}

// ───────────────────────────── expenses

export type ExpenseInput = {
  date: Date; description: string; categoryId?: string | null; amountMinor: number;
  methodId?: string | null; vendor?: string | null; notes?: string | null;
  customFields?: Record<string, unknown>;
};

export async function createExpense({ orgId, config, actor }: Base, input: ExpenseInput) {
  if (input.amountMinor < 0) throw new Error("Amount cannot be negative.");
  return db.transaction(async (tx) => {
    await assertCategoryInOrg(tx, orgId, input.categoryId, "EXPENSE");
    await assertMethodInOrg(tx, orgId, input.methodId);
    const code = await allocateNumber(tx, orgId, "EXPENSE", input.date);
    const [row] = await tx.insert(expenses).values({
      orgId, code, date: input.date, description: input.description.trim(),
      categoryId: input.categoryId || null, amountMinor: input.amountMinor,
      methodId: input.methodId || null, vendor: input.vendor || null, notes: input.notes || null,
      createdByUserId: actor.userId,
    }).returning();

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "EXPENSE");
      await saveCustomFieldValues(tx, orgId, "EXPENSE", row.id, defs, input.customFields);
    }
    await logActivity(tx, { orgId, actor, entityType: "EXPENSE", entityId: row.id, type: "expense.created", message: `${config.t("expense")} ${config.money(row.amountMinor)} — ${row.description}` });
    await logAudit(tx, { orgId, actor, action: "expense.create", entityType: "Expense", entityId: row.id, after: { code, amountMinor: row.amountMinor } });
    return row;
  });
}

export async function updateExpense({ orgId, config, actor }: Base, id: string, input: ExpenseInput) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(expenses).where(and(eq(expenses.orgId, orgId), eq(expenses.id, id))).limit(1);
    mustExist(before, config.t("expense"));
    await assertCategoryInOrg(tx, orgId, input.categoryId, "EXPENSE");
    await assertMethodInOrg(tx, orgId, input.methodId);

    const [row] = await tx.update(expenses).set({
      date: input.date, description: input.description.trim(), categoryId: input.categoryId || null,
      amountMinor: input.amountMinor, methodId: input.methodId || null,
      vendor: input.vendor || null, notes: input.notes || null, updatedAt: new Date(),
    }).where(eq(expenses.id, id)).returning();

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "EXPENSE");
      await saveCustomFieldValues(tx, orgId, "EXPENSE", id, defs, input.customFields);
    }
    await logAudit(tx, { orgId, actor, action: "expense.update", entityType: "Expense", entityId: id, before: { amountMinor: before.amountMinor }, after: { amountMinor: row.amountMinor } });
    return row;
  });
}

export async function archiveExpense({ orgId, actor }: Base, id: string) {
  return db.transaction(async (tx) => {
    await tx.update(expenses).set({ archivedAt: new Date() }).where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)));
    await logAudit(tx, { orgId, actor, action: "expense.archive", entityType: "Expense", entityId: id });
  });
}

// ───────────────────────────── events & production

export type EventInput = {
  name: string; startDate?: Date | null; endDate?: Date | null; location?: string | null;
  notes?: string | null; budgetMinor?: number | null; expectedSalesMinor?: number | null;
  customFields?: Record<string, unknown>;
};

export async function createEvent({ orgId, config, actor }: Base, input: EventInput) {
  return db.transaction(async (tx) => {
    const code = await allocateNumber(tx, orgId, "EVENT");
    const [row] = await tx.insert(events).values({
      orgId, code, name: input.name.trim(),
      startDate: input.startDate ?? null, endDate: input.endDate ?? null,
      location: input.location || null, notes: input.notes || null,
      budgetMinor: input.budgetMinor ?? null, expectedSalesMinor: input.expectedSalesMinor ?? null,
    }).returning();

    if (input.customFields) {
      const defs = await loadFieldDefs(tx, orgId, "EVENT");
      await saveCustomFieldValues(tx, orgId, "EVENT", row.id, defs, input.customFields);
    }
    await logActivity(tx, { orgId, actor, entityType: "EVENT", entityId: row.id, type: "event.created", message: `${config.t("event")} ${row.name} created` });
    await logAudit(tx, { orgId, actor, action: "event.create", entityType: "Event", entityId: row.id, after: { code, name: row.name } });
    return row;
  });
}

export async function updateEvent({ orgId, actor }: Base, id: string, input: EventInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(events).set({
      name: input.name.trim(), startDate: input.startDate ?? null, endDate: input.endDate ?? null,
      location: input.location || null, notes: input.notes || null,
      budgetMinor: input.budgetMinor ?? null, expectedSalesMinor: input.expectedSalesMinor ?? null,
      updatedAt: new Date(),
    }).where(and(eq(events.orgId, orgId), eq(events.id, id))).returning();
    mustExist(row, "Event");
    await logAudit(tx, { orgId, actor, action: "event.update", entityType: "Event", entityId: id, after: { name: row.name } });
    return row;
  });
}

export async function archiveEvent({ orgId, actor }: Base, id: string) {
  return db.transaction(async (tx) => {
    await tx.update(events).set({ archivedAt: new Date() }).where(and(eq(events.orgId, orgId), eq(events.id, id)));
    await logAudit(tx, { orgId, actor, action: "event.archive", entityType: "Event", entityId: id });
  });
}

export type ProductionItemInput = {
  productId: string | null; productName?: string; categoryId?: string | null;
  quantityPlanned: number; quantityCompleted?: number; unitPriceMinor: number; note?: string | null;
};

export async function addProductionItem({ orgId, config, actor }: Base, eventId: string, input: ProductionItemInput) {
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(events).where(and(eq(events.orgId, orgId), eq(events.id, eventId))).limit(1);
    mustExist(event, config.t("event"));
    await assertCategoryInOrg(tx, orgId, input.categoryId, "PRODUCT");

    let name = input.productName?.trim() ?? "";
    let categoryId = input.categoryId ?? null;
    if (input.productId) {
      const [product] = await tx.select().from(products).where(and(eq(products.orgId, orgId), eq(products.id, input.productId))).limit(1);
      mustExist(product, config.t("product"));
      name = product.name;
      categoryId = categoryId ?? product.categoryId;
    }
    if (!name) throw new Error(`Choose a ${config.t("product").toLowerCase()} or type a name.`);
    if (!(input.quantityPlanned > 0)) throw new Error("Quantity to make must be greater than zero.");

    const check = validateCompletion({
      quantityPlanned: input.quantityPlanned,
      quantityCompleted: input.quantityCompleted ?? 0,
      allowOverproduction: config.settings.events.allowOverproduction,
    });
    if (!check.ok) throw new Error(check.reason);

    const existing = await tx.select({ id: eventProductionItems.id }).from(eventProductionItems)
      .where(and(eq(eventProductionItems.orgId, orgId), eq(eventProductionItems.eventId, eventId)));

    const [row] = await tx.insert(eventProductionItems).values({
      orgId, eventId, productId: input.productId, productNameSnapshot: name, categoryId,
      quantityPlanned: input.quantityPlanned, quantityCompleted: input.quantityCompleted ?? 0,
      unitPriceMinor: Math.max(input.unitPriceMinor, 0), note: input.note ?? null,
      sortOrder: existing.length,
    }).returning();

    await logAudit(tx, { orgId, actor, action: "event.item.create", entityType: "EventProductionItem", entityId: row.id, after: { eventId, name, planned: row.quantityPlanned } });
    return row;
  });
}

export async function updateProductionItem({ orgId, config, actor }: Base, itemId: string, input: Partial<ProductionItemInput>) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(eventProductionItems)
      .where(and(eq(eventProductionItems.orgId, orgId), eq(eventProductionItems.id, itemId))).limit(1);
    mustExist(before, "Production line");
    if (input.categoryId !== undefined) await assertCategoryInOrg(tx, orgId, input.categoryId, "PRODUCT");

    const planned = input.quantityPlanned ?? before.quantityPlanned;
    const completed = input.quantityCompleted ?? before.quantityCompleted;

    const check = validateCompletion({
      quantityPlanned: planned, quantityCompleted: completed,
      allowOverproduction: config.settings.events.allowOverproduction,
    });
    if (!check.ok) throw new Error(check.reason);

    const [row] = await tx.update(eventProductionItems).set({
      quantityPlanned: planned,
      quantityCompleted: completed,
      unitPriceMinor: input.unitPriceMinor ?? before.unitPriceMinor,
      categoryId: input.categoryId !== undefined ? input.categoryId : before.categoryId,
      note: input.note !== undefined ? input.note : before.note,
      updatedAt: new Date(),
    }).where(eq(eventProductionItems.id, itemId)).returning();

    if (completed !== before.quantityCompleted) {
      await logActivity(tx, {
        orgId, actor, entityType: "EVENT", entityId: before.eventId, type: "event.progress",
        message: `${row.productNameSnapshot}: ${completed} of ${planned} made`,
        meta: { itemId, from: before.quantityCompleted, to: completed },
      });
    }
    await logAudit(tx, { orgId, actor, action: "event.item.update", entityType: "EventProductionItem", entityId: itemId, before: { planned: before.quantityPlanned, completed: before.quantityCompleted }, after: { planned, completed } });
    return row;
  });
}

export async function removeProductionItem({ orgId, actor }: Base, itemId: string) {
  return db.transaction(async (tx) => {
    await tx.delete(eventProductionItems).where(and(eq(eventProductionItems.orgId, orgId), eq(eventProductionItems.id, itemId)));
    await logAudit(tx, { orgId, actor, action: "event.item.delete", entityType: "EventProductionItem", entityId: itemId });
  });
}
