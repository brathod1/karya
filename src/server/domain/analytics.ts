import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, notInArray, sql, sum } from "drizzle-orm";
import { db } from "@/server/db";
import {
  categories, customers, eventProductionItems, events, expenses, orderItems, orders, payments, products, statusDefinitions,
} from "@/server/db/schema";
import { computeEventProgress } from "./events";
import {
  addCalendarDays, addCalendarMonths, calendarDay, endOfCalendarMonth, isoDate, monthKey, startOfCalendarMonth,
} from "@/lib/dates";
import { completedStatusIds, openStatusIds, statusesBySemantic, type OrgConfig } from "./config";

/**
 * Every number on the dashboard, on analytics, and in exports is produced here,
 * from the same transactional tables. There is no separate reporting store to
 * drift out of sync.
 */

export type DateRange = { from: Date; to: Date };

export const DASHBOARD_PERIODS = ["month", "last-month", "quarter", "year", "all"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  month: "This month",
  "last-month": "Last month",
  quarter: "Last 3 months",
  year: "This year",
  all: "All time",
};

/**
 * A dashboard fixed to the calendar month reads all zeros for anyone entering
 * back-dated work — which is most people in their first week, moving a
 * spreadsheet across. The period is therefore chosen, not assumed.
 */
export function periodRange(period: DashboardPeriod, today = new Date()): DateRange {
  switch (period) {
    case "last-month": {
      const previous = addCalendarMonths(today, -1);
      return { from: startOfCalendarMonth(previous), to: endOfCalendarMonth(previous) };
    }
    case "quarter":
      return { from: startOfCalendarMonth(addCalendarMonths(today, -2)), to: endOfCalendarMonth(today) };
    case "year":
      return { from: calendarDay(new Date(today.getFullYear(), 0, 1)), to: endOfCalendarMonth(today) };
    case "all":
      return { from: calendarDay(new Date(2000, 0, 1)), to: endOfCalendarMonth(today) };
    case "month":
    default:
      return { from: startOfCalendarMonth(today), to: endOfCalendarMonth(today) };
  }
}

/** The earliest dated activity, so the picker offers only years with data in them. */
export async function activityBounds(orgId: string): Promise<{ earliest: Date | null; latestOrder: Date | null }> {
  // One statement for all three figures the dashboard needs about *when*
  // things happened, instead of three separate scans.
  const [row] = await db.select({
    earliestOrder: sql<string | null>`(select min(order_date)::text from orders where org_id = ${orgId} and archived_at is null)`,
    latestOrder: sql<string | null>`(select max(order_date)::text from orders where org_id = ${orgId} and archived_at is null)`,
    earliestExpense: sql<string | null>`(select min(date)::text from expenses where org_id = ${orgId} and archived_at is null)`,
  }).from(sql`(select 1) as _`);

  const candidates = [row?.earliestOrder, row?.earliestExpense].filter(Boolean).map((v) => new Date(v as string));
  return {
    earliest: candidates.length ? candidates.reduce((a, b) => (b < a ? b : a)) : null,
    latestOrder: row?.latestOrder ? new Date(row.latestOrder) : null,
  };
}

/** The most recent order date, used to point somewhere useful when a period is empty. */
export async function latestOrderDate(orgId: string): Promise<Date | null> {
  const [row] = await db.select({ value: sql<string | null>`max(${orders.orderDate})::text` })
    .from(orders)
    .where(and(eq(orders.orgId, orgId), isNull(orders.archivedAt)));
  return row?.value ? new Date(row.value) : null;
}

/**
 * These bound `date` columns, so they are calendar days anchored at 12:00 UTC —
 * see `lib/dates.ts` for why local midnight is the wrong thing to send.
 * `startOfDay` and `endOfDay` are the same value: a date range is inclusive of
 * both endpoints because the column has no time component to exclude.
 */
export const startOfDay = calendarDay;
export const endOfDay = calendarDay;
export const monthStart = startOfCalendarMonth;
export const monthEnd = endOfCalendarMonth;
export const addMonths = addCalendarMonths;
export const previousDay = (d: Date) => addCalendarDays(d, -1);

const n = (v: unknown) => Number(v ?? 0);

/** Statuses that should not count towards revenue (cancelled work). */
function excludedStatusIds(config: OrgConfig): string[] {
  return statusesBySemantic(config, "CANCELLED").map((s) => s.id);
}

function liveOrders(orgId: string, config: OrgConfig) {
  const excluded = excludedStatusIds(config);
  return excluded.length
    ? and(eq(orders.orgId, orgId), isNull(orders.archivedAt), notInArray(orders.statusId, excluded))
    : and(eq(orders.orgId, orgId), isNull(orders.archivedAt));
}

export type SalesSummary = {
  orderCount: number;
  salesMinor: number;
  collectedMinor: number;
  outstandingMinor: number;
  averageOrderMinor: number;
  expensesMinor: number;
};

export async function salesSummary(orgId: string, config: OrgConfig, range: DateRange): Promise<SalesSummary> {
  // Two unrelated tables: no reason to wait for one before asking the other.
  // Every round trip to a distant database costs the same again.
  const [[orderAgg], [expenseAgg]] = await Promise.all([
    db.select({
      orderCount: count(orders.id),
      salesMinor: sum(orders.totalMinor),
      collectedMinor: sum(orders.paidMinor),
    })
      .from(orders)
      .where(and(liveOrders(orgId, config), gte(orders.orderDate, range.from), lte(orders.orderDate, range.to))),

    db.select({ total: sum(expenses.amountMinor) })
      .from(expenses)
      .where(and(eq(expenses.orgId, orgId), isNull(expenses.archivedAt), gte(expenses.date, range.from), lte(expenses.date, range.to))),
  ]);

  const salesMinor = n(orderAgg?.salesMinor);
  const collectedMinor = n(orderAgg?.collectedMinor);
  const orderCount = n(orderAgg?.orderCount);

  return {
    orderCount,
    salesMinor,
    collectedMinor,
    outstandingMinor: Math.max(salesMinor - collectedMinor, 0),
    averageOrderMinor: orderCount ? Math.round(salesMinor / orderCount) : 0,
    expensesMinor: n(expenseAgg?.total),
  };
}

/** Total money owed to the business across all time — not limited to a range. */
/**
 * Two periods, two statements.
 *
 * The dashboard always wants "today" alongside the selected period. Asking
 * separately meant four round trips over the same two tables; `filter` gets
 * both from one scan each.
 */
export async function salesSummaryPair(
  orgId: string, config: OrgConfig, a: DateRange, b: DateRange,
): Promise<[SalesSummary, SalesSummary]> {
  // Bound as date strings, not Dates — see the note in needsAttention.
  const within = (col: typeof orders.orderDate | typeof expenses.date, range: DateRange) =>
    sql`${col} between ${isoDate(range.from)} and ${isoDate(range.to)}`;

  const [[orderRow], [expenseRow]] = await Promise.all([
    db.select({
      aCount: sql<number>`count(*) filter (where ${within(orders.orderDate, a)})`,
      aSales: sql<string>`coalesce(sum(${orders.totalMinor}) filter (where ${within(orders.orderDate, a)}), 0)`,
      aPaid: sql<string>`coalesce(sum(${orders.paidMinor}) filter (where ${within(orders.orderDate, a)}), 0)`,
      bCount: sql<number>`count(*) filter (where ${within(orders.orderDate, b)})`,
      bSales: sql<string>`coalesce(sum(${orders.totalMinor}) filter (where ${within(orders.orderDate, b)}), 0)`,
      bPaid: sql<string>`coalesce(sum(${orders.paidMinor}) filter (where ${within(orders.orderDate, b)}), 0)`,
    }).from(orders).where(liveOrders(orgId, config)),

    db.select({
      aTotal: sql<string>`coalesce(sum(${expenses.amountMinor}) filter (where ${within(expenses.date, a)}), 0)`,
      bTotal: sql<string>`coalesce(sum(${expenses.amountMinor}) filter (where ${within(expenses.date, b)}), 0)`,
    }).from(expenses).where(and(eq(expenses.orgId, orgId), isNull(expenses.archivedAt))),
  ]);

  const build = (countValue: unknown, sales: unknown, paid: unknown, spend: unknown): SalesSummary => {
    const salesMinor = n(sales);
    const collectedMinor = n(paid);
    const orderCount = n(countValue);
    return {
      orderCount,
      salesMinor,
      collectedMinor,
      outstandingMinor: Math.max(salesMinor - collectedMinor, 0),
      averageOrderMinor: orderCount ? Math.round(salesMinor / orderCount) : 0,
      expensesMinor: n(spend),
    };
  };

  return [
    build(orderRow?.aCount, orderRow?.aSales, orderRow?.aPaid, expenseRow?.aTotal),
    build(orderRow?.bCount, orderRow?.bSales, orderRow?.bPaid, expenseRow?.bTotal),
  ];
}

export async function totalOutstanding(orgId: string, config: OrgConfig) {
  const [row] = await db
    .select({
      totalMinor: sum(orders.totalMinor),
      paidMinor: sum(orders.paidMinor),
      unpaidOrders: count(orders.id),
    })
    .from(orders)
    .where(and(liveOrders(orgId, config), ne(orders.paymentStatus, "PAID")));

  return {
    outstandingMinor: Math.max(n(row?.totalMinor) - n(row?.paidMinor), 0),
    unpaidOrders: n(row?.unpaidOrders),
  };
}

export async function ordersByStatus(orgId: string, config: OrgConfig) {
  const rows = await db
    .select({ statusId: orders.statusId, c: count(orders.id), totalMinor: sum(orders.totalMinor) })
    .from(orders)
    .where(and(eq(orders.orgId, orgId), isNull(orders.archivedAt)))
    .groupBy(orders.statusId);

  const byId = new Map(rows.map((r) => [r.statusId, r]));
  return config.orderStatuses.map((s) => ({
    status: s,
    count: n(byId.get(s.id)?.c),
    totalMinor: n(byId.get(s.id)?.totalMinor),
  }));
}

/**
 * Everything the dashboard needs to know about orders, in one scan.
 *
 * This replaces four separate statements — today's totals, the period's
 * totals, the five attention counts and the outstanding balance — which were
 * four passes over the same table with different filters. Measured against a
 * database ~70ms away, collapsing them removes roughly a third of the page's
 * remaining wait.
 */
export type OrderSnapshot = {
  today: SalesSummary;
  period: SalesSummary;
  attention: AttentionCounts;
  outstandingMinor: number;
  unpaidOrders: number;
};

export async function orderSnapshot(
  orgId: string, config: OrgConfig, todayRange: DateRange, periodRange: DateRange, now = new Date(),
): Promise<OrderSnapshot> {
  const production = statusesBySemantic(config, "PRODUCTION").map((s) => s.id);
  const shipment = statusesBySemantic(config, "SHIPMENT").map((s) => s.id);
  const open = openStatusIds(config);

  const inList = (ids: string[]) => (ids.length ? inArray(orders.statusId, ids) : sql`false`);
  const todayIso = isoDate(calendarDay(now));
  const within = (range: DateRange) =>
    sql`${orders.orderDate} between ${isoDate(range.from)} and ${isoDate(range.to)}`;

  const [row] = await db
    .select({
      // Today
      todayCount: sql<number>`count(*) filter (where ${within(todayRange)})`,
      todaySales: sql<string>`coalesce(sum(${orders.totalMinor}) filter (where ${within(todayRange)}), 0)`,
      todayPaid: sql<string>`coalesce(sum(${orders.paidMinor}) filter (where ${within(todayRange)}), 0)`,
      // Selected period
      periodCount: sql<number>`count(*) filter (where ${within(periodRange)})`,
      periodSales: sql<string>`coalesce(sum(${orders.totalMinor}) filter (where ${within(periodRange)}), 0)`,
      periodPaid: sql<string>`coalesce(sum(${orders.paidMinor}) filter (where ${within(periodRange)}), 0)`,
      // Needs attention
      inProduction: sql<number>`count(*) filter (where ${inList(production)})`,
      awaitingShipment: sql<number>`count(*) filter (where ${inList(shipment)})`,
      dueToday: sql<number>`count(*) filter (where ${inList(open)} and ${orders.deliveryByDate} = ${todayIso})`,
      overdue: sql<number>`count(*) filter (where ${inList(open)} and ${orders.deliveryByDate} < ${todayIso})`,
      paymentsPending: sql<number>`count(*) filter (where ${orders.paymentStatus} <> 'PAID')`,
      // Outstanding, all time
      outstandingTotal: sql<string>`coalesce(sum(${orders.totalMinor}) filter (where ${orders.paymentStatus} <> 'PAID'), 0)`,
      outstandingPaid: sql<string>`coalesce(sum(${orders.paidMinor}) filter (where ${orders.paymentStatus} <> 'PAID'), 0)`,
    })
    .from(orders)
    .where(liveOrders(orgId, config));

  const summary = (countValue: unknown, sales: unknown, paid: unknown): SalesSummary => {
    const salesMinor = n(sales);
    const collectedMinor = n(paid);
    const orderCount = n(countValue);
    return {
      orderCount,
      salesMinor,
      collectedMinor,
      outstandingMinor: Math.max(salesMinor - collectedMinor, 0),
      averageOrderMinor: orderCount ? Math.round(salesMinor / orderCount) : 0,
      expensesMinor: 0, // filled in by the caller from the expenses scan
    };
  };

  return {
    today: summary(row?.todayCount, row?.todaySales, row?.todayPaid),
    period: summary(row?.periodCount, row?.periodSales, row?.periodPaid),
    attention: {
      inProduction: n(row?.inProduction),
      awaitingShipment: n(row?.awaitingShipment),
      dueToday: n(row?.dueToday),
      overdue: n(row?.overdue),
      paymentsPending: n(row?.paymentsPending),
    },
    outstandingMinor: Math.max(n(row?.outstandingTotal) - n(row?.outstandingPaid), 0),
    unpaidOrders: n(row?.paymentsPending),
  };
}

/** Expense totals for the same two ranges, in one scan of the expenses table. */
export async function expenseTotals(
  orgId: string, todayRange: DateRange, periodRange: DateRange,
): Promise<{ todayMinor: number; periodMinor: number }> {
  const within = (range: DateRange) =>
    sql`${expenses.date} between ${isoDate(range.from)} and ${isoDate(range.to)}`;

  const [row] = await db
    .select({
      todayMinor: sql<string>`coalesce(sum(${expenses.amountMinor}) filter (where ${within(todayRange)}), 0)`,
      periodMinor: sql<string>`coalesce(sum(${expenses.amountMinor}) filter (where ${within(periodRange)}), 0)`,
    })
    .from(expenses)
    .where(and(eq(expenses.orgId, orgId), isNull(expenses.archivedAt)));

  return { todayMinor: n(row?.todayMinor), periodMinor: n(row?.periodMinor) };
}

export type AttentionCounts = {
  inProduction: number;
  awaitingShipment: number;
  dueToday: number;
  overdue: number;
  paymentsPending: number;
};

export async function needsAttention(orgId: string, config: OrgConfig, today = new Date()): Promise<AttentionCounts> {
  // Asked for by MEANING, never by label — this is what makes statuses genuinely configurable.
  const production = statusesBySemantic(config, "PRODUCTION").map((s) => s.id);
  const shipment = statusesBySemantic(config, "SHIPMENT").map((s) => s.id);
  const open = openStatusIds(config);
  const start = startOfDay(today);
  const end = endOfDay(today);

  const base = and(eq(orders.orgId, orgId), isNull(orders.archivedAt));

  // Five numbers, one scan. `count(*) filter (where …)` computes them all in a
  // single pass rather than opening five connections for five integers.
  //
  // Two things here are deliberate, both of which have bitten this codebase:
  //   · `inArray` rather than `in ${ids}` — a bare array in a raw template does
  //     not render as a parenthesised list, and produces invalid SQL.
  //   · dates bound as `YYYY-MM-DD` strings rather than Date objects — a Date
  //     is sent as a timestamp, and comparing a `date` column against noon
  //     silently excludes that whole day.
  const inList = (ids: string[]) => (ids.length ? inArray(orders.statusId, ids) : sql`false`);
  const todayIso = isoDate(start);

  const [row] = await db
    .select({
      inProduction: sql<number>`count(*) filter (where ${inList(production)})`,
      awaitingShipment: sql<number>`count(*) filter (where ${inList(shipment)})`,
      dueToday: sql<number>`count(*) filter (where ${inList(open)} and ${orders.deliveryByDate} = ${todayIso})`,
      overdue: sql<number>`count(*) filter (where ${inList(open)} and ${orders.deliveryByDate} < ${todayIso})`,
      paymentsPending: sql<number>`count(*) filter (where ${orders.paymentStatus} <> 'PAID')`,
    })
    .from(orders)
    .where(base);

  return {
    inProduction: n(row?.inProduction),
    awaitingShipment: n(row?.awaitingShipment),
    dueToday: n(row?.dueToday),
    overdue: n(row?.overdue),
    paymentsPending: n(row?.paymentsPending),
  };
}

export type SeriesPoint = { label: string; key: string; revenueMinor: number; collectedMinor: number; expensesMinor: number; orders: number };

export async function monthlySeries(orgId: string, config: OrgConfig, months = 6, today = new Date()): Promise<SeriesPoint[]> {
  const from = addCalendarMonths(today, -(months - 1));
  const to = endOfCalendarMonth(today);

  const [orderRows, expenseRows] = await Promise.all([
    db.select({
      k: sql<string>`to_char(${orders.orderDate}, 'YYYY-MM')`,
      revenue: sum(orders.totalMinor),
      collected: sum(orders.paidMinor),
      c: count(orders.id),
    })
      .from(orders)
      .where(and(liveOrders(orgId, config), gte(orders.orderDate, from), lte(orders.orderDate, to)))
      .groupBy(sql`to_char(${orders.orderDate}, 'YYYY-MM')`),

    db.select({ k: sql<string>`to_char(${expenses.date}, 'YYYY-MM')`, total: sum(expenses.amountMinor) })
      .from(expenses)
      .where(and(eq(expenses.orgId, orgId), isNull(expenses.archivedAt), gte(expenses.date, from), lte(expenses.date, to)))
      .groupBy(sql`to_char(${expenses.date}, 'YYYY-MM')`),
  ]);

  const orderMap = new Map(orderRows.map((r) => [r.k, r]));
  const expenseMap = new Map(expenseRows.map((r) => [r.k, r]));

  const out: SeriesPoint[] = [];
  for (let i = 0; i < months; i++) {
    const d = addCalendarMonths(from, i);
    const key = monthKey(d);
    out.push({
      key,
      label: d.toLocaleString("en", { month: "short", timeZone: "UTC" }),
      revenueMinor: n(orderMap.get(key)?.revenue),
      collectedMinor: n(orderMap.get(key)?.collected),
      expensesMinor: n(expenseMap.get(key)?.total),
      orders: n(orderMap.get(key)?.c),
    });
  }
  return out;
}

export type ProductSales = { productId: string | null; name: string; quantity: number; revenueMinor: number; orders: number };

export async function topProducts(orgId: string, config: OrgConfig, range: DateRange, limit = 5): Promise<ProductSales[]> {
  const rows = await db
    .select({
      productId: orderItems.productId,
      name: orderItems.productNameSnapshot,
      quantity: sum(orderItems.quantity),
      revenue: sum(orderItems.lineTotalMinor),
      orderCount: count(orderItems.orderId),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(liveOrders(orgId, config), gte(orders.orderDate, range.from), lte(orders.orderDate, range.to)))
    .groupBy(orderItems.productId, orderItems.productNameSnapshot)
    .orderBy(desc(sum(orderItems.lineTotalMinor)))
    .limit(limit);

  return rows.map((r) => ({
    productId: r.productId,
    name: r.name,
    quantity: n(r.quantity),
    revenueMinor: n(r.revenue),
    orders: n(r.orderCount),
  }));
}

export async function salesByCategory(orgId: string, config: OrgConfig, range: DateRange) {
  const rows = await db
    .select({
      categoryId: products.categoryId,
      name: categories.name,
      revenue: sum(orderItems.lineTotalMinor),
      quantity: sum(orderItems.quantity),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(liveOrders(orgId, config), gte(orders.orderDate, range.from), lte(orders.orderDate, range.to)))
    .groupBy(products.categoryId, categories.name)
    .orderBy(desc(sum(orderItems.lineTotalMinor)));

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name ?? "Uncategorised",
    revenueMinor: n(r.revenue),
    quantity: n(r.quantity),
  }));
}

export async function expensesByCategory(orgId: string, range: DateRange) {
  const rows = await db
    .select({ categoryId: expenses.categoryId, name: categories.name, total: sum(expenses.amountMinor), c: count() })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(and(eq(expenses.orgId, orgId), isNull(expenses.archivedAt), gte(expenses.date, range.from), lte(expenses.date, range.to)))
    .groupBy(expenses.categoryId, categories.name)
    .orderBy(desc(sum(expenses.amountMinor)));

  return rows.map((r) => ({ categoryId: r.categoryId, name: r.name ?? "Uncategorised", amountMinor: n(r.total), count: n(r.c) }));
}

export type CustomerBalance = {
  customerId: string; name: string; code: string; phone: string | null;
  totalMinor: number; paidMinor: number; balanceMinor: number; orderCount: number; lastOrderDate: Date | null;
};

export async function customersWhoOwe(orgId: string, config: OrgConfig, limit = 100): Promise<CustomerBalance[]> {
  const rows = await db
    .select({
      customerId: customers.id, name: customers.name, code: customers.code, phone: customers.phone,
      totalMinor: sum(orders.totalMinor), paidMinor: sum(orders.paidMinor),
      orderCount: count(orders.id), lastOrderDate: sql<Date | null>`max(${orders.orderDate})`,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(and(liveOrders(orgId, config), ne(orders.paymentStatus, "PAID")))
    .groupBy(customers.id, customers.name, customers.code, customers.phone)
    .orderBy(desc(sql`sum(${orders.totalMinor}) - sum(${orders.paidMinor})`))
    .limit(limit);

  return rows
    .map((r) => ({
      customerId: r.customerId, name: r.name, code: r.code, phone: r.phone,
      totalMinor: n(r.totalMinor), paidMinor: n(r.paidMinor),
      balanceMinor: n(r.totalMinor) - n(r.paidMinor),
      orderCount: n(r.orderCount), lastOrderDate: r.lastOrderDate ? new Date(r.lastOrderDate) : null,
    }))
    .filter((r) => r.balanceMinor > 0);
}

export async function topCustomers(orgId: string, config: OrgConfig, range: DateRange, limit = 5) {
  const rows = await db
    .select({
      customerId: customers.id, name: customers.name,
      totalMinor: sum(orders.totalMinor), orderCount: count(orders.id),
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(and(liveOrders(orgId, config), gte(orders.orderDate, range.from), lte(orders.orderDate, range.to)))
    .groupBy(customers.id, customers.name)
    .orderBy(desc(sum(orders.totalMinor)))
    .limit(limit);

  return rows.map((r) => ({ customerId: r.customerId, name: r.name, totalMinor: n(r.totalMinor), orderCount: n(r.orderCount) }));
}

/** Next upcoming (or most recent) event with its production progress. */
export async function upcomingEventProgress(orgId: string, config: OrgConfig, today = new Date()) {
  // Ask for both candidates at once rather than discovering we need the second.
  const [[next], [fallback]] = await Promise.all([
    db.select().from(events)
      .where(and(eq(events.orgId, orgId), isNull(events.archivedAt), gte(events.startDate, startOfDay(today))))
      .orderBy(asc(events.startDate)).limit(1),
    db.select().from(events)
      .where(and(eq(events.orgId, orgId), isNull(events.archivedAt)))
      .orderBy(desc(events.startDate)).limit(1),
  ]);

  const event = next ?? fallback;
  if (!event) return null;

  const items = await db.select().from(eventProductionItems)
    .where(and(eq(eventProductionItems.orgId, orgId), eq(eventProductionItems.eventId, event.id)))
    .orderBy(asc(eventProductionItems.sortOrder));

  const progress = computeEventProgress(items, config.settings.events.completeThresholdPct);
  return { event, items, progress };
}

/** Estimated profit. Returns null unless cost tracking is enabled and costs exist. */
export async function estimatedProfit(orgId: string, config: OrgConfig, range: DateRange) {
  if (!config.settings.pricing.enableCostTracking) return null;

  const [[revenueRow], [costRow], [expenseRow]] = await Promise.all([
    db.select({ revenue: sum(orders.totalMinor) })
      .from(orders)
      .where(and(liveOrders(orgId, config), gte(orders.orderDate, range.from), lte(orders.orderDate, range.to))),

    db.select({ cost: sql<string>`coalesce(sum(${orderItems.quantity} * coalesce(${products.costMinor}, 0)), 0)` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(and(liveOrders(orgId, config), gte(orders.orderDate, range.from), lte(orders.orderDate, range.to))),

    db.select({ total: sum(expenses.amountMinor) })
      .from(expenses)
      .where(and(eq(expenses.orgId, orgId), isNull(expenses.archivedAt), gte(expenses.date, range.from), lte(expenses.date, range.to))),
  ]);

  const revenueMinor = n(revenueRow?.revenue);
  const productCostMinor = Math.round(n(costRow?.cost));
  const expensesMinor = n(expenseRow?.total);

  return { revenueMinor, productCostMinor, expensesMinor, profitMinor: revenueMinor - productCostMinor - expensesMinor };
}

/** Orders finished in a period — used by the completion rate on analytics. */
export async function completedOrderCount(orgId: string, config: OrgConfig, range: DateRange) {
  const done = completedStatusIds(config);
  if (done.length === 0) return 0;
  const [row] = await db.select({ c: count() }).from(orders)
    .where(and(eq(orders.orgId, orgId), isNull(orders.archivedAt), inArray(orders.statusId, done),
      gte(orders.orderDate, range.from), lte(orders.orderDate, range.to)));
  return n(row?.c);
}
