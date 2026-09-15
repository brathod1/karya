import "server-only";
import { and, eq } from "drizzle-orm";
import type { Exec } from "@/server/db";
import { categories, customers, paymentMethods } from "@/server/db/schema";
import { mustExist } from "@/server/db/tenant";

/**
 * Ownership checks for ids that arrive from a client.
 *
 * A UUID from a browser is shape-valid, not proof that it belongs to this
 * workspace. Read models join configuration tables — categories, payment
 * methods — by id alone, so a foreign id stored on a row would show another
 * workspace's labels on this one's screens. Every externally supplied
 * reference passes through one of these before it is written.
 *
 * Archived rows still count as owned: editing an old product must not fail
 * because its category was later archived.
 */

export async function assertCustomerInOrg(tx: Exec, orgId: string, customerId: string | null | undefined) {
  if (!customerId) return;
  const [row] = await tx.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId))).limit(1);
  mustExist(row, "Customer");
}

export async function assertMethodInOrg(tx: Exec, orgId: string, methodId: string | null | undefined) {
  if (!methodId) return;
  const [row] = await tx.select({ id: paymentMethods.id }).from(paymentMethods)
    .where(and(eq(paymentMethods.orgId, orgId), eq(paymentMethods.id, methodId))).limit(1);
  mustExist(row, "Payment method");
}

/** A product category on a product, or an expense category on an expense — never crossed. */
export async function assertCategoryInOrg(
  tx: Exec, orgId: string, categoryId: string | null | undefined, kind: "PRODUCT" | "EXPENSE",
) {
  if (!categoryId) return;
  const [row] = await tx.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.orgId, orgId), eq(categories.id, categoryId), eq(categories.kind, kind))).limit(1);
  mustExist(row, "Category");
}
