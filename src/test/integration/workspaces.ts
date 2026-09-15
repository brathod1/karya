import { randomUUID } from "node:crypto";
import { and, asc, eq, like, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import {
  categories, customFieldDefinitions, eventProductionItems, memberships, organizations,
  paymentMethods, payments, statusDefinitions, users, customerPrices,
} from "@/server/db/schema";
import { createOrganization } from "@/server/domain/provisioning";
import { signSession } from "@/server/session";
import { createOrderAction } from "@/server/actions/orders";
import {
  addProductionItemAction, createCustomerAction, createEventAction, createExpenseAction,
  createProductAction, setCustomerPriceAction,
} from "@/server/actions/entities";
import { uploadAttachmentAction } from "@/server/actions/attachments";
import { saveViewAction } from "@/server/actions/views";
import { upsertCustomFieldAction } from "@/server/actions/settings";

const SESSION_COOKIE = "karya_session";
const ORG_NAME_PREFIX = "Isolation test ";
const EMAIL_PATTERN = "isolation-%@example.test";

function cookieJar(): Map<string, string> {
  const holder = globalThis as { __karyaTestCookies?: Map<string, string> };
  return (holder.__karyaTestCookies ??= new Map<string, string>());
}

/** Signs in exactly as the app does: a signed session token in the cookie. */
export async function signInAs(userId: string, orgId: string | null, sessionVersion = 1) {
  cookieJar().set(SESSION_COOKIE, await signSession({ userId, orgId, v: sessionVersion }));
}

export function signOut() {
  cookieJar().delete(SESSION_COOKIE);
}

export function currentSessionToken() {
  return cookieJar().get(SESSION_COOKIE);
}

/** Unwraps an action result during setup, failing loudly if a seed step broke. */
export function must<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Fixture step failed: ${(result as { error?: string }).error ?? "unknown error"}`);
  }
  return result as Extract<T, { ok: true }>;
}

/** The raw row, read around the application's own scoping on purpose. */
export async function rowById(table: PgTable, id: string): Promise<Record<string, unknown> | undefined> {
  const result = await db.execute(sql`select * from ${table} where id = ${id}`);
  return result.rows[0] as Record<string, unknown> | undefined;
}

/** A real PNG header: enough to pass the upload's magic-byte check. */
export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
]);

export type SeededWorkspace = {
  label: string;
  userId: string;
  userEmail: string;
  orgId: string;
  membershipId: string;
  statusIds: string[];
  methodId: string;
  productCategoryId: string;
  expenseCategoryId: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  priceId: string;
  orderId: string;
  orderNumber: string;
  paymentId: string;
  expenseId: string;
  eventId: string;
  itemId: string;
  attachmentId: string;
  viewId: string;
  fieldId: string;
};

/**
 * A complete workspace with one of everything, created through the same server
 * actions the UI uses. Leaves the session signed in as its owner.
 */
export async function seedWorkspace(label: string): Promise<SeededWorkspace> {
  const tag = randomUUID().slice(0, 8);

  const [user] = await db.insert(users).values({
    email: `isolation-${label.toLowerCase()}-${tag}@example.test`,
    name: `Isolation ${label}`,
    passwordHash: "not-a-usable-hash",
  }).returning();

  const org = await createOrganization({
    userId: user.id, name: `${ORG_NAME_PREFIX}${label} ${tag}`, templateKey: "handmade",
  });
  await signInAs(user.id, org.id);

  const [membership] = await db.select().from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id))).limit(1);
  const statusRows = await db.select().from(statusDefinitions)
    .where(eq(statusDefinitions.orgId, org.id)).orderBy(asc(statusDefinitions.sortOrder));
  const [method] = await db.select().from(paymentMethods).where(eq(paymentMethods.orgId, org.id)).limit(1);
  const [productCategory] = await db.select().from(categories)
    .where(and(eq(categories.orgId, org.id), eq(categories.kind, "PRODUCT"))).limit(1);
  const [expenseCategory] = await db.select().from(categories)
    .where(and(eq(categories.orgId, org.id), eq(categories.kind, "EXPENSE"))).limit(1);
  if (!membership || !method || !productCategory || !expenseCategory || statusRows.length < 2) {
    throw new Error("The handmade template no longer seeds statuses, payment methods and categories. Update this fixture.");
  }

  const customerName = `Customer ${label} ${tag}`;
  const customer = must(await createCustomerAction({ name: customerName, phone: "9000000000" })).data;

  const productName = `Plushie ${label} ${tag}`;
  const product = must(await createProductAction({
    name: productName, defaultPriceMinor: 50_000, categoryId: productCategory.id,
  })).data;

  must(await setCustomerPriceAction({
    customerId: customer.id, productId: product.id, priceMinor: 45_000, discountPercent: null,
  }));
  const [price] = await db.select().from(customerPrices)
    .where(and(eq(customerPrices.orgId, org.id), eq(customerPrices.customerId, customer.id))).limit(1);

  const order = must(await createOrderAction({
    customerId: customer.id,
    orderDate: new Date(),
    items: [{ productId: product.id, quantity: 2 }],
    advance: { amountMinor: 20_000, methodId: method.id },
  })).data;
  const [payment] = await db.select().from(payments)
    .where(and(eq(payments.orgId, org.id), eq(payments.orderId, order.id))).limit(1);

  // Unspent customer credit, so reading someone else's credit has something to find.
  await db.insert(payments).values({
    orgId: org.id, customerId: customer.id, orderId: null, amountMinor: 5_000, kind: "CREDIT", note: "Isolation test credit",
  });

  const expense = must(await createExpenseAction({
    date: new Date(), description: `Yarn ${label} ${tag}`, amountMinor: 12_345,
    categoryId: expenseCategory.id, methodId: method.id,
  })).data;

  const event = must(await createEventAction({ name: `Stall ${label} ${tag}` })).data;
  must(await addProductionItemAction(event.id, { productId: product.id, quantityPlanned: 10, unitPriceMinor: 50_000 }));
  const [item] = await db.select().from(eventProductionItems)
    .where(and(eq(eventProductionItems.orgId, org.id), eq(eventProductionItems.eventId, event.id))).limit(1);

  const upload = new FormData();
  upload.set("entityType", "ORDER");
  upload.set("entityId", order.id);
  upload.set("file", new File([PNG_BYTES], "receipt.png", { type: "image/png" }));
  const attachment = must(await uploadAttachmentAction(upload)).data;

  const view = must(await saveViewAction({ entityType: "orders", name: `Shared view ${label}`, shared: true, config: {} })).data;

  const fieldLabel = `Secret field ${label} ${tag}`;
  must(await upsertCustomFieldAction({ entityType: "CUSTOMER", label: fieldLabel, type: "TEXT" }));
  const [field] = await db.select().from(customFieldDefinitions)
    .where(and(eq(customFieldDefinitions.orgId, org.id), eq(customFieldDefinitions.label, fieldLabel))).limit(1);

  return {
    label,
    userId: user.id,
    userEmail: user.email,
    orgId: org.id,
    membershipId: membership.id,
    statusIds: statusRows.map((s) => s.id),
    methodId: method.id,
    productCategoryId: productCategory.id,
    expenseCategoryId: expenseCategory.id,
    customerId: customer.id,
    customerName,
    productId: product.id,
    productName,
    priceId: price.id,
    orderId: order.id,
    orderNumber: order.number,
    paymentId: payment.id,
    expenseId: expense.id,
    eventId: event.id,
    itemId: item.id,
    attachmentId: attachment.id,
    viewId: view.id,
    fieldId: field.id,
  };
}

/**
 * Removes every workspace and user these tests create, including leftovers
 * from an earlier run that crashed. Deleting an organisation cascades to all
 * of its data, attachment bytes included.
 */
export async function removeTestData() {
  await db.delete(organizations).where(like(organizations.name, `${ORG_NAME_PREFIX}%`));
  await db.delete(users).where(like(users.email, EMAIL_PATTERN));
}

export async function closeDatabase() {
  const holder = globalThis as { __karyaPool?: { end(): Promise<void> } };
  await holder.__karyaPool?.end();
}
