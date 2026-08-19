import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  activityEntries, categories, customerPrices, customers, eventProductionItems, events,
  expenses, orderItems, orders, paymentMethods, payments, products, statusDefinitions,
} from "@/server/db/schema";
import { mustExist } from "@/server/db/tenant";
import { isoDate } from "@/lib/dates";

/**
 * How many rows a list screen loads at once.
 *
 * The tables search, filter and sort in the browser, which is what makes them
 * feel instant — the cost is that everything shown must be in memory. 1,000
 * rows is roughly two years of this business and stays comfortably fast; past
 * that the screen says so rather than quietly slowing down. Moving filtering to
 * the server is the next step when a workspace outgrows this, and it is a
 * change to the table component, not to these queries.
 */
export const LIST_LIMIT = 1000;

/**
 * Read models for pages. Every query is scoped by orgId; every returned value is
 * plain and serialisable so it can cross the server/client boundary safely.
 */

export async function listOrders(orgId: string, { includeArchived = false }: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select({
      id: orders.id, number: orders.number, orderDate: orders.orderDate,
      deliveryByDate: orders.deliveryByDate, totalMinor: orders.totalMinor,
      paidMinor: orders.paidMinor, paymentStatus: orders.paymentStatus,
      statusId: orders.statusId, note: orders.note,
      customerId: customers.id, customerName: customers.name, customerPhone: customers.phone,
      statusLabel: statusDefinitions.label, statusColor: statusDefinitions.color,
      statusCompleted: statusDefinitions.isCompleted,
      archivedAt: orders.archivedAt,
      // Total before the limit, in the same statement — no extra round trip.
      totalCount: sql<number>`count(*) over()`,
    })
    .from(orders)
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .innerJoin(statusDefinitions, eq(orders.statusId, statusDefinitions.id))
    .where(includeArchived
      ? and(eq(orders.orgId, orgId), isNotNull(orders.archivedAt))
      : and(eq(orders.orgId, orgId), isNull(orders.archivedAt)))
    .orderBy(desc(orders.orderDate), desc(orders.createdAt))
    .limit(LIST_LIMIT);

  // One query for every line on the page, rather than two subqueries per row.
  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          name: orderItems.productNameSnapshot,
          quantity: orderItems.quantity,
          attributes: orderItems.attributes,
          note: orderItems.note,
          sortOrder: orderItems.sortOrder,
        })
        .from(orderItems)
        .where(and(eq(orderItems.orgId, orgId), inArray(orderItems.orderId, ids)))
        .orderBy(asc(orderItems.sortOrder))
    : [];

  const byOrder = new Map<string, typeof items>();
  for (const item of items) {
    byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), item]);
  }

  return rows.map((r) => {
    const lines = byOrder.get(r.id) ?? [];
    return {
      ...r,
      totalCount: Number(r.totalCount ?? rows.length),
      orderDate: isoDate(r.orderDate),
      deliveryByDate: isoDate(r.deliveryByDate),
      balanceMinor: r.totalMinor - r.paidMinor,
      itemCount: lines.length,
      archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
      items: lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        note: l.note,
        attributes: (l.attributes as Record<string, unknown> | null) ?? null,
      })),
    };
  });
}

/**
 * What still has to be made.
 *
 * Aggregates every line on every order that is not finished or cancelled, so
 * seven red cotton bandanas spread across four orders read as one job of seven.
 * Grouping is by product *and* attributes — the whole point of recording them.
 */
export async function productionQueue(orgId: string, openStatusIds: string[]) {
  if (openStatusIds.length === 0) return [];

  const rows = await db
    .select({
      productId: orderItems.productId,
      name: orderItems.productNameSnapshot,
      attributes: orderItems.attributes,
      quantity: orderItems.quantity,
      orderId: orders.id,
      orderNumber: orders.number,
      deliveryByDate: orders.deliveryByDate,
      customerName: customers.name,
      statusLabel: statusDefinitions.label,
      statusColor: statusDefinitions.color,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(statusDefinitions, eq(orders.statusId, statusDefinitions.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(
      eq(orderItems.orgId, orgId),
      isNull(orders.archivedAt),
      inArray(orders.statusId, openStatusIds),
    ))
    .orderBy(asc(orders.deliveryByDate));

  return rows.map((r) => ({
    productId: r.productId,
    name: r.name,
    attributes: (r.attributes as Record<string, unknown> | null) ?? null,
    quantity: r.quantity,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    deliveryByDate: isoDate(r.deliveryByDate),
    customerName: r.customerName,
    statusLabel: r.statusLabel,
    statusColor: r.statusColor,
  }));
}

export async function getOrder(orgId: string, orderId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.id, orderId)))
    .limit(1);
  mustExist(order, "Order");

  const [items, paymentRows, customer, activity] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.sortOrder)),
    db.select({ payment: payments, methodLabel: paymentMethods.label })
      .from(payments).leftJoin(paymentMethods, eq(payments.methodId, paymentMethods.id))
      .where(eq(payments.orderId, orderId)).orderBy(asc(payments.paidAt)),
    order.customerId
      ? db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db.select().from(activityEntries)
      .where(and(eq(activityEntries.orgId, orgId), eq(activityEntries.entityType, "ORDER"), eq(activityEntries.entityId, orderId)))
      .orderBy(asc(activityEntries.createdAt)),
  ]);

  return { order, items, payments: paymentRows, customer, activity };
}

/**
 * Customer list with their order totals.
 *
 * Deliberately a LEFT JOIN with GROUP BY rather than correlated subqueries.
 * Drizzle only qualifies a column reference with its table name when the query
 * contains a join; in a single-table query `${customers.id}` renders as bare
 * `"id"`, which inside a subquery over `orders` silently resolves to the
 * *order's* id and matches nothing. Every customer then reads zero, with no
 * error anywhere. Aggregating by join removes the possibility entirely.
 */
export async function listCustomers(orgId: string, { includeArchived = false }: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select({
      id: customers.id, code: customers.code, name: customers.name,
      phone: customers.phone, email: customers.email, tags: customers.tags,
      createdAt: customers.createdAt,
      orderCount: sql<number>`count(${orders.id})`,
      totalMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
      paidMinor: sql<number>`coalesce(sum(${orders.paidMinor}), 0)`,
      lastOrderDate: sql<string | null>`max(${orders.orderDate})::text`,
    })
    .from(customers)
    .leftJoin(orders, and(eq(orders.customerId, customers.id), isNull(orders.archivedAt)))
    .where(includeArchived
      ? and(eq(customers.orgId, orgId), isNotNull(customers.archivedAt))
      : and(eq(customers.orgId, orgId), isNull(customers.archivedAt)))
    .groupBy(customers.id, customers.code, customers.name, customers.phone, customers.email, customers.tags, customers.createdAt)
    .orderBy(asc(customers.name))
    .limit(LIST_LIMIT);

  return rows.map((r) => ({
    ...r,
    orderCount: Number(r.orderCount ?? 0),
    totalMinor: Number(r.totalMinor ?? 0),
    paidMinor: Number(r.paidMinor ?? 0),
    balanceMinor: Number(r.totalMinor ?? 0) - Number(r.paidMinor ?? 0),
  }));
}

export async function getCustomer(orgId: string, customerId: string) {
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, customerId))).limit(1);
  mustExist(customer, "Customer");

  const [orderRows, paymentRows, priceRows, productRows] = await Promise.all([
    db.select({
      id: orders.id, number: orders.number, orderDate: orders.orderDate, deliveryByDate: orders.deliveryByDate,
      totalMinor: orders.totalMinor, paidMinor: orders.paidMinor, paymentStatus: orders.paymentStatus,
      statusLabel: statusDefinitions.label, statusColor: statusDefinitions.color, statusCompleted: statusDefinitions.isCompleted,
    })
      .from(orders).innerJoin(statusDefinitions, eq(orders.statusId, statusDefinitions.id))
      .where(and(eq(orders.orgId, orgId), eq(orders.customerId, customerId), isNull(orders.archivedAt)))
      .orderBy(desc(orders.orderDate)),
    db.select({ payment: payments, methodLabel: paymentMethods.label, orderNumber: orders.number })
      .from(payments)
      .leftJoin(paymentMethods, eq(payments.methodId, paymentMethods.id))
      .leftJoin(orders, eq(payments.orderId, orders.id))
      .where(and(eq(payments.orgId, orgId), eq(payments.customerId, customerId)))
      .orderBy(desc(payments.paidAt)),
    db.select({ price: customerPrices, productName: products.name, productDefault: products.defaultPriceMinor })
      .from(customerPrices).leftJoin(products, eq(customerPrices.productId, products.id))
      .where(and(eq(customerPrices.orgId, orgId), eq(customerPrices.customerId, customerId))),
    db.select({
      productId: orderItems.productId, name: orderItems.productNameSnapshot,
      quantity: sql<number>`sum(${orderItems.quantity})`, revenue: sql<number>`sum(${orderItems.lineTotalMinor})`,
    })
      .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.orgId, orgId), eq(orders.customerId, customerId), isNull(orders.archivedAt)))
      .groupBy(orderItems.productId, orderItems.productNameSnapshot)
      .orderBy(desc(sql`sum(${orderItems.lineTotalMinor})`)),
  ]);

  return { customer, orders: orderRows, payments: paymentRows, prices: priceRows, productsBought: productRows };
}

export async function listProducts(orgId: string, { includeArchived = false }: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select({
      id: products.id, code: products.code, name: products.name, description: products.description,
      categoryId: products.categoryId, categoryName: categories.name,
      defaultPriceMinor: products.defaultPriceMinor, costMinor: products.costMinor,
      unit: products.unit, isActive: products.isActive, imageUrl: products.imageUrl,
      soldQuantity: sql<number>`(
        select coalesce(sum(oi.quantity),0) from order_items oi
        join orders o on o.id = oi.order_id
        where oi.product_id = "products"."id" and o.archived_at is null)`,
      soldRevenue: sql<number>`(
        select coalesce(sum(oi.line_total_minor),0) from order_items oi
        join orders o on o.id = oi.order_id
        where oi.product_id = "products"."id" and o.archived_at is null)`,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(includeArchived
      ? and(eq(products.orgId, orgId), isNotNull(products.archivedAt))
      : and(eq(products.orgId, orgId), isNull(products.archivedAt)))
    .orderBy(asc(products.name))
    .limit(LIST_LIMIT);

  return rows.map((r) => ({ ...r, soldQuantity: Number(r.soldQuantity ?? 0), soldRevenue: Number(r.soldRevenue ?? 0) }));
}

export async function getProduct(orgId: string, productId: string) {
  const [product] = await db.select().from(products)
    .where(and(eq(products.orgId, orgId), eq(products.id, productId))).limit(1);
  mustExist(product, "Product");

  const [priceRows, history] = await Promise.all([
    db.select({ price: customerPrices, customerName: customers.name })
      .from(customerPrices).innerJoin(customers, eq(customerPrices.customerId, customers.id))
      .where(and(eq(customerPrices.orgId, orgId), eq(customerPrices.productId, productId))),
    db.select({
      orderId: orders.id, number: orders.number, orderDate: orders.orderDate,
      customerName: customers.name, quantity: orderItems.quantity,
      unitPriceMinor: orderItems.unitPriceMinor, lineTotalMinor: orderItems.lineTotalMinor,
      priceSource: orderItems.priceSource,
    })
      .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(and(eq(orders.orgId, orgId), eq(orderItems.productId, productId), isNull(orders.archivedAt)))
      .orderBy(desc(orders.orderDate)).limit(50),
  ]);

  return { product, prices: priceRows, history };
}

export async function listEvents(orgId: string) {
  const rows = await db.select().from(events)
    .where(and(eq(events.orgId, orgId), isNull(events.archivedAt)))
    .orderBy(desc(events.startDate));

  const items = await db.select().from(eventProductionItems).where(eq(eventProductionItems.orgId, orgId));

  return rows.map((event) => ({ event, items: items.filter((i) => i.eventId === event.id) }));
}

export async function getEvent(orgId: string, eventId: string) {
  const [event] = await db.select().from(events)
    .where(and(eq(events.orgId, orgId), eq(events.id, eventId))).limit(1);
  mustExist(event, "Event");

  const items = await db
    .select({ item: eventProductionItems, categoryName: categories.name })
    .from(eventProductionItems)
    .leftJoin(categories, eq(eventProductionItems.categoryId, categories.id))
    .where(and(eq(eventProductionItems.orgId, orgId), eq(eventProductionItems.eventId, eventId)))
    .orderBy(asc(eventProductionItems.sortOrder));

  return { event, items };
}

export async function listExpenses(orgId: string, { includeArchived = false }: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select({
      id: expenses.id, code: expenses.code, date: expenses.date, description: expenses.description,
      amountMinor: expenses.amountMinor, vendor: expenses.vendor, notes: expenses.notes,
      categoryId: expenses.categoryId, categoryName: categories.name,
      methodId: expenses.methodId, methodLabel: paymentMethods.label,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .leftJoin(paymentMethods, eq(expenses.methodId, paymentMethods.id))
    .where(includeArchived
      ? and(eq(expenses.orgId, orgId), isNotNull(expenses.archivedAt))
      : and(eq(expenses.orgId, orgId), isNull(expenses.archivedAt)))
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .limit(LIST_LIMIT);

  return rows.map((r) => ({ ...r, date: isoDate(r.date) }));
}

export async function listPayments(orgId: string) {
  const rows = await db
    .select({
      id: payments.id, amountMinor: payments.amountMinor, paidAt: payments.paidAt,
      reference: payments.reference, note: payments.note, kind: payments.kind, voidedAt: payments.voidedAt,
      methodLabel: paymentMethods.label,
      orderId: orders.id, orderNumber: orders.number,
      customerId: customers.id, customerName: customers.name,
    })
    .from(payments)
    .leftJoin(paymentMethods, eq(payments.methodId, paymentMethods.id))
    .leftJoin(orders, eq(payments.orderId, orders.id))
    .leftJoin(customers, eq(payments.customerId, customers.id))
    .where(eq(payments.orgId, orgId))
    .orderBy(desc(payments.paidAt), desc(payments.createdAt))
    .limit(LIST_LIMIT);

  return rows.map((r) => ({ ...r, paidAt: isoDate(r.paidAt) }));
}

/**
 * Counts archived records for the "Archived (n)" badge.
 *
 * This used to call the full list query and take `.length`, which meant a table
 * scan — with per-row subqueries — on every page load, to render one integer.
 */
export async function countArchived(orgId: string, entity: "orders" | "customers" | "products" | "expenses") {
  const table = { orders, customers, products, expenses }[entity];
  const [row] = await db.select({ value: count() }).from(table)
    .where(and(eq(table.orgId, orgId), isNotNull(table.archivedAt)));
  return Number(row?.value ?? 0);
}

export async function pickerData(orgId: string) {
  const [customerRows, productRows] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers).where(and(eq(customers.orgId, orgId), isNull(customers.archivedAt)))
      .orderBy(asc(customers.name)).limit(LIST_LIMIT),
    db.select({
      id: products.id, name: products.name, defaultPriceMinor: products.defaultPriceMinor,
      unit: products.unit, categoryId: products.categoryId,
    })
      .from(products)
      .where(and(eq(products.orgId, orgId), isNull(products.archivedAt), eq(products.isActive, true)))
      .orderBy(asc(products.name)).limit(LIST_LIMIT),
  ]);
  return { customers: customerRows, products: productRows };
}

export async function recentActivity(orgId: string, limit = 12) {
  return db.select().from(activityEntries)
    .where(eq(activityEntries.orgId, orgId))
    .orderBy(desc(activityEntries.createdAt))
    .limit(limit);
}
