import { profile } from "@/server/db/instrument";
import { requireModule } from "@/server/context";
import { listPayments } from "@/server/queries";
import { customersWhoOwe, totalOutstanding } from "@/server/domain/analytics";
import { PageBody, PageHeader } from "@/components/page-header";
import { isoDate } from "@/lib/dates";
import { MetricCard } from "@/components/metric-card";
import { PaymentsTabs } from "./payments-tabs";

async function PaymentsPageInner() {
  const ctx = await requireModule("payments");
  const [rows, owing, outstanding] = await Promise.all([
    listPayments(ctx.org.id),
    customersWhoOwe(ctx.org.id, ctx.config),
    totalOutstanding(ctx.org.id, ctx.config),
  ]);

  const received = rows.filter((r) => !r.voidedAt && r.kind !== "REFUND").reduce((a, r) => a + r.amountMinor, 0);

  return (
    <>
      <PageHeader title={ctx.config.t("payment", "many")} description="Money in, and money still owed to you." />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Received all time" value={ctx.config.money(received)} tone="positive" sub={`${rows.length} payments`} />
          <MetricCard label="Outstanding" value={ctx.config.money(outstanding.outstandingMinor)} tone={outstanding.outstandingMinor > 0 ? "danger" : "positive"}
            sub={`${outstanding.unpaidOrders} ${ctx.config.t("order", "many").toLowerCase()} not fully paid`} />
          <MetricCard label={`${ctx.config.t("customer", "many")} who owe you`} value={String(owing.length)} tone={owing.length ? "warning" : "positive"} />
        </div>

        <PaymentsTabs
          payments={rows}
          owing={owing.map((o) => ({
            customerId: o.customerId, name: o.name, phone: o.phone,
            balanceMinor: o.balanceMinor, orderCount: o.orderCount,
            lastOrderDate: isoDate(o.lastOrderDate),
          }))}
        />
      </PageBody>
    </>
  );
}

/**
 * Reports this page's database use when profiling is on (development, or
 * KARYA_PROFILE=1), so a slow screen can be diagnosed with numbers.
 */
export default async function PaymentsPage() {
  return profile("Payments", () => PaymentsPageInner());
}
