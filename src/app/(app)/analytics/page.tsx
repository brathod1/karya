import { profile } from "@/server/db/instrument";
import { requireModule } from "@/server/context";
import {
  activityBounds, completedOrderCount, endOfDay, estimatedProfit, expensesByCategory,
  monthlySeries, ordersByStatus, salesByCategory, salesSummary, topCustomers, topProducts,
  totalOutstanding,
} from "@/server/domain/analytics";
import { addCalendarMonths, calendarDay, endOfCalendarMonth, startOfCalendarMonth } from "@/lib/dates";
import { resolvePeriod, selectableFinancialYears, selectableYears } from "@/lib/period";
import { PeriodPicker } from "@/components/period-picker";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { AnalyticsCharts } from "./analytics-charts";
import { Badge } from "@/components/ui/badge";

async function AnalyticsPageInner({
  searchParams,
}: { searchParams: Promise<{ range?: string; year?: string; fy?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const ctx = await requireModule("analytics");
  const { config } = ctx;
  const money = config.money;
  const now = new Date();
  const period = resolvePeriod(params, now);
  const month = { from: period.from, to: period.to };
  const previousMonth = addCalendarMonths(now, -1);
  const lastMonth = { from: startOfCalendarMonth(previousMonth), to: endOfCalendarMonth(previousMonth) };
  const allTime = { from: calendarDay(new Date(2000, 0, 1)), to: endOfDay(now) };

  const [thisMonth, previous, all, outstanding, series, byStatus, products, categoriesSales, expenseSplit, customers, profit, completed, bounds] =
    await Promise.all([
      salesSummary(ctx.org.id, config, month),
      salesSummary(ctx.org.id, config, lastMonth),
      salesSummary(ctx.org.id, config, allTime),
      totalOutstanding(ctx.org.id, config),
      monthlySeries(ctx.org.id, config, 12, now),
      ordersByStatus(ctx.org.id, config),
      topProducts(ctx.org.id, config, allTime, 8),
      salesByCategory(ctx.org.id, config, allTime),
      expensesByCategory(ctx.org.id, allTime),
      topCustomers(ctx.org.id, config, allTime, 8),
      estimatedProfit(ctx.org.id, config, allTime),
      completedOrderCount(ctx.org.id, config, allTime),
      activityBounds(ctx.org.id),
    ]);

  const delta = previous.salesMinor > 0
    ? Math.round(((thisMonth.salesMinor - previous.salesMinor) / previous.salesMinor) * 100)
    : null;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Built from the same records you enter every day — nothing is estimated."
        actions={
          <PeriodPicker
            label={period.label}
            selected={period.params}
            years={selectableYears(bounds.earliest, now)}
            financialYears={selectableFinancialYears(bounds.earliest, now)}
          />
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={`Sales · ${period.label.toLowerCase()}`} value={money(thisMonth.salesMinor)}
            delta={delta !== null ? { pct: delta, label: "vs the month before" } : null} />
          <MetricCard label="Sales all time" value={money(all.salesMinor)}
            sub={`${all.orderCount} ${config.t("order", "many").toLowerCase()} · ${completed} completed`} />
          <MetricCard label="Outstanding" value={money(outstanding.outstandingMinor)} tone={outstanding.outstandingMinor > 0 ? "danger" : "positive"} />
          <MetricCard label={`${config.t("expense", "many")} all time`} value={money(all.expensesMinor)} tone="warning" />
        </div>

        {profit ? (
          <Card>
            <CardHeader title="Profit estimate" description="Only shown because cost tracking is switched on." />
            <CardBody className="grid gap-3 sm:grid-cols-4">
              <MetricCard label="Revenue" value={money(profit.revenueMinor)} />
              <MetricCard label={`${config.t("product")} costs`} value={money(profit.productCostMinor)} />
              <MetricCard label={config.t("expense", "many")} value={money(profit.expensesMinor)} />
              <MetricCard label="Estimated profit" value={money(profit.profitMinor)} tone={profit.profitMinor >= 0 ? "positive" : "danger"} />
            </CardBody>
          </Card>
        ) : null}

        <AnalyticsCharts
          currencySymbol={config.org.currencySymbol}
          series={series.map((s) => ({
            label: s.label, revenue: s.revenueMinor / 100, collected: s.collectedMinor / 100,
            expenses: s.expensesMinor / 100, orders: s.orders,
          }))}
          productSales={products.map((p) => ({ name: p.name, value: p.revenueMinor / 100 }))}
          categorySales={categoriesSales.map((c) => ({ name: c.name, value: c.revenueMinor / 100 }))}
          expenseSplit={expenseSplit.map((e) => ({ name: e.name, value: e.amountMinor / 100 }))}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={`${config.t("order", "many")} by status`} />
            <CardBody>
              <ul className="space-y-2.5">
                {byStatus.map((s) => (
                  <li key={s.status.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <Badge color={s.status.color} dot>{s.status.label}</Badge>
                    <span className="tabular text-ink-muted">{s.count} · {money(s.totalMinor)}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`Top ${config.t("customer", "many").toLowerCase()}`} />
            <CardBody>
              {customers.length === 0 ? <p className="text-[13px] text-ink-subtle">No data yet.</p> : (
                <ul className="space-y-2.5">
                  {customers.map((c) => (
                    <li key={c.customerId} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 tabular text-ink-muted">{c.orderCount} · {money(c.totalMinor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

/**
 * Reports this page's database use when profiling is on (development, or
 * KARYA_PROFILE=1), so a slow screen can be diagnosed with numbers.
 */
export default async function Page(props: { searchParams: Promise<{ range?: string; year?: string; fy?: string; from?: string; to?: string }> }) {
  return profile("Analytics", () => AnalyticsPageInner(props));
}
