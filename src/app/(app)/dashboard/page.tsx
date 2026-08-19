import { profile } from "@/server/db/instrument";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CalendarClock, Clock, Package, Receipt, TrendingUp, Wallet,
} from "lucide-react";
import { requireOrgContext } from "@/server/context";
import {
  activityBounds, endOfDay, estimatedProfit, expenseTotals, expensesByCategory,
  monthlySeries, orderSnapshot, startOfDay, topProducts,
  upcomingEventProgress,
} from "@/server/domain/analytics";
import { resolvePeriod, selectableFinancialYears, selectableYears } from "@/lib/period";
import { customersWhoOwe } from "@/server/domain/analytics";
import { recentActivity } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { ProgressBar, ProgressRing } from "@/components/progress";
import { Badge } from "@/components/ui/badge";
import { RevenueChart } from "./revenue-chart";
import { computeProductionLine } from "@/server/domain/events";
import { formatDate, formatDateTime } from "@/lib/format";
import { PeriodPicker } from "@/components/period-picker";

async function DashboardPageInner({
  searchParams,
}: { searchParams: Promise<{ range?: string; year?: string; fy?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const ctx = await requireOrgContext();
  const { config } = ctx;
  const money = config.money;
  const now = new Date();

  const widgets = config.settings.dashboard.widgets
    .filter((w) => w.enabled)
    .sort((a, b) => a.order - b.order);
  const enabled = (key: string) => widgets.some((w) => w.key === key);

  const today = { from: startOfDay(now), to: endOfDay(now) };
  const period = resolvePeriod(params, now);
  const month = { from: period.from, to: period.to };

  // One scan of orders for today, the period, the attention counts and the
  // outstanding balance; one scan of expenses for both periods. These used to
  // be six separate statements over two tables.
  const [snapshot, expenseSums, series, products, expenses, event, owing, activity, profit, bounds] =
    await Promise.all([
      orderSnapshot(ctx.org.id, config, today, month, now),
      expenseTotals(ctx.org.id, today, month),
      enabled("revenueChart") ? monthlySeries(ctx.org.id, config, 6, now) : Promise.resolve([]),
      enabled("topProducts") ? topProducts(ctx.org.id, config, month, 5) : Promise.resolve([]),
      enabled("expenses") ? expensesByCategory(ctx.org.id, month) : Promise.resolve([]),
      enabled("productionProgress") && config.settings.modules.events ? upcomingEventProgress(ctx.org.id, config, now) : Promise.resolve(null),
      enabled("outstanding") ? customersWhoOwe(ctx.org.id, config, 5) : Promise.resolve([]),
      enabled("recentActivity") ? recentActivity(ctx.org.id, 8) : Promise.resolve([]),
      enabled("profit") ? estimatedProfit(ctx.org.id, config, month) : Promise.resolve(null),
      activityBounds(ctx.org.id),
    ]);

  const todaySummary = { ...snapshot.today, expensesMinor: expenseSums.todayMinor };
  const monthSummary = { ...snapshot.period, expensesMinor: expenseSums.periodMinor };
  const attention = snapshot.attention;
  const outstanding = {
    outstandingMinor: snapshot.outstandingMinor,
    unpaidOrders: snapshot.unpaidOrders,
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${config.org.name} · ${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <PeriodPicker
              label={period.label}
              selected={period.params}
              years={selectableYears(bounds.earliest, now)}
              financialYears={selectableFinancialYears(bounds.earliest, now)}
            />
            <Link href="/settings/dashboard" className="text-[12.5px] font-medium text-brand hover:underline">
              Configure widgets
            </Link>
          </div>
        }
      />

      <PageBody className="space-y-4">
        {enabled("today") ? (
          <section>
            <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-subtle">Today</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard label={config.t("order", "many")} value={String(todaySummary.orderCount)} icon={Package} />
              <MetricCard label="Sales" value={money(todaySummary.salesMinor)} icon={TrendingUp} />
              <MetricCard label="Collected" value={money(todaySummary.collectedMinor)} tone="positive" icon={Wallet} />
              <MetricCard label="Outstanding" value={money(outstanding.outstandingMinor)}
                tone={outstanding.outstandingMinor > 0 ? "danger" : "positive"}
                sub={`${outstanding.unpaidOrders} unpaid`} icon={AlertTriangle} />
              <MetricCard label={config.t("expense", "many")} value={money(todaySummary.expensesMinor)} icon={Receipt} />
            </div>
          </section>
        ) : null}

        {/* A period with nothing in it should say where the data actually is,
            rather than leaving someone staring at a wall of zeros. */}
        {monthSummary.orderCount === 0 && bounds.latestOrder ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 ring-1 ring-amber-200">
            <span>
              No {config.t("order", "many").toLowerCase()} dated in {period.label.toLowerCase()}.
              The most recent one is dated {formatDate(bounds.latestOrder, config.dateFormat)}.
            </span>
            <Link href="/dashboard?range=all" className="font-medium underline">Show all time</Link>
          </div>
        ) : null}

        <section>
          <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-ink-subtle">
            {period.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Sales" value={money(monthSummary.salesMinor)} sub={`${monthSummary.orderCount} ${config.t("order", "many").toLowerCase()}`} />
            <MetricCard label={`Average ${config.t("order").toLowerCase()}`} value={money(monthSummary.averageOrderMinor)} />
            <MetricCard label={config.t("expense", "many")} value={money(monthSummary.expensesMinor)} tone="warning" />
            {profit ? (
              <MetricCard label="Estimated profit" value={money(profit.profitMinor)} tone={profit.profitMinor >= 0 ? "positive" : "danger"}
                sub={`Revenue − ${config.t("product").toLowerCase()} cost − ${config.t("expense", "many").toLowerCase()}`} />
            ) : (
              <MetricCard label="Collected" value={money(monthSummary.collectedMinor)} tone="positive" />
            )}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {enabled("needsAttention") ? (
              <Card>
                <CardHeader title="Needs attention" description="The things worth looking at right now." />
                <CardBody className="grid gap-2.5 sm:grid-cols-2">
                  <AttentionRow href="/orders?filter=production" icon={Clock} tone="amber"
                    count={attention.inProduction} label={`in production`} />
                  <AttentionRow href="/orders?filter=shipment" icon={Package} tone="sky"
                    count={attention.awaitingShipment} label="ready to ship or in transit" />
                  <AttentionRow href="/orders?filter=today" icon={CalendarClock} tone="red"
                    count={attention.dueToday} label="due today" />
                  <AttentionRow href="/orders?filter=overdue" icon={AlertTriangle} tone="red"
                    count={attention.overdue} label="overdue" />
                  <AttentionRow href="/payments" icon={Wallet} tone="amber"
                    count={attention.paymentsPending} label="waiting on payment" />
                </CardBody>
              </Card>
            ) : null}

            {enabled("revenueChart") && series.length > 0 ? (
              <Card>
                <CardHeader title={`Revenue and ${config.t("expense", "many").toLowerCase()}`} description="Last 6 months." />
                <CardBody>
                  <RevenueChart
                    data={series.map((p) => ({
                      label: p.label,
                      revenue: p.revenueMinor / 100,
                      collected: p.collectedMinor / 100,
                      expenses: p.expensesMinor / 100,
                    }))}
                    currencySymbol={config.org.currencySymbol}
                    expenseLabel={config.t("expense", "many")}
                  />
                </CardBody>
              </Card>
            ) : null}

            {event ? (
              <Card>
                <CardHeader
                  title="Production progress"
                  description={`${event.event.name}${event.event.startDate ? ` · ${new Date(event.event.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}`}
                  action={<Link href={`/events/${event.event.id}`} className="text-[12.5px] font-medium text-brand hover:underline">Open</Link>}
                />
                <CardBody className="flex flex-wrap items-center gap-6">
                  <ProgressRing value={event.progress.progressPct}
                    caption={`${event.progress.totalCompleted} / ${event.progress.totalPlanned}`} sub="made" />
                  <ul className="flex-1 min-w-[220px] space-y-2.5">
                    {event.items.slice(0, 5).map((item) => {
                      const line = computeProductionLine(item, config.settings.events.completeThresholdPct);
                      return (
                        <li key={item.id}>
                          <div className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="truncate">{item.productNameSnapshot}</span>
                            <span className="shrink-0 tabular text-ink-muted">
                              {item.quantityCompleted} / {item.quantityPlanned}
                            </span>
                          </div>
                          <ProgressBar className="mt-1" value={line.progressPct} tone={line.status === "COMPLETE" ? "emerald" : "brand"} />
                        </li>
                      );
                    })}
                  </ul>
                </CardBody>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            {enabled("topProducts") && products.length > 0 ? (
              <Card>
                <CardHeader title={`Top ${config.t("product", "many").toLowerCase()}`} description={`${period.label} by revenue.`} />
                <CardBody>
                  <ul className="space-y-2.5">
                    {products.map((p) => (
                      <li key={p.name} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 tabular text-ink-muted">{p.quantity} · {money(p.revenueMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}

            {enabled("outstanding") && owing.length > 0 ? (
              <Card>
                <CardHeader title={`${config.t("customer", "many")} who owe you`}
                  action={<Link href="/payments" className="text-[12.5px] font-medium text-brand hover:underline">All</Link>} />
                <CardBody>
                  <ul className="space-y-2.5">
                    {owing.map((c) => (
                      <li key={c.customerId} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <Link href={`/customers/${c.customerId}`} className="truncate hover:underline">{c.name}</Link>
                        <span className="shrink-0 tabular font-medium text-red-700">{money(c.balanceMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}

            {enabled("expenses") && expenses.length > 0 ? (
              <Card>
                <CardHeader title={`${config.t("expense", "many")} · ${period.label.toLowerCase()}`} />
                <CardBody>
                  <ul className="space-y-2.5">
                    {expenses.slice(0, 6).map((e) => (
                      <li key={e.name} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="truncate">{e.name}</span>
                        <span className="shrink-0 tabular text-ink-muted">{money(e.amountMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}

            {enabled("recentActivity") && activity.length > 0 ? (
              <Card>
                <CardHeader title="Recent activity" />
                <CardBody>
                  <ul className="space-y-2.5">
                    {activity.map((a) => (
                      <li key={a.id} className="text-[12.5px]">
                        <p>{a.message}</p>
                        <p className="text-[11.5px] text-ink-subtle tabular">{formatDateTime(a.createdAt, config.dateFormat + ", HH:mm")}</p>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function AttentionRow({ href, icon: Icon, count, label, tone }: {
  href: string; icon: React.ComponentType<{ className?: string }>;
  count: number; label: string; tone: "amber" | "red" | "sky";
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line hover:bg-stone-100 transition-colors">
      <Icon className={`size-4 shrink-0 ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-sky-600"}`} />
      <span className="text-[13px]">
        <span className="font-semibold tabular">{count}</span> <span className="text-ink-muted">{label}</span>
      </span>
      <ArrowRight className="ml-auto size-3.5 text-ink-subtle" />
    </Link>
  );
}

/**
 * Reports this page's database use when profiling is on (development, or
 * KARYA_PROFILE=1), so a slow screen can be diagnosed with numbers.
 */
export default async function Page(props: { searchParams: Promise<{ range?: string; year?: string; fy?: string; from?: string; to?: string }> }) {
  return profile("Dashboard", () => DashboardPageInner(props));
}
