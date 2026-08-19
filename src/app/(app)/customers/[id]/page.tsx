import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireModule } from "@/server/context";
import { getCustomer, pickerData } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { CustomerOrders } from "./customer-orders";
import { CustomerPricing } from "./customer-pricing";
import { RecordActions } from "@/components/record-actions";
import { formatDate } from "@/lib/format";
import { isoDate } from "@/lib/dates";
import { getCustomerCredit } from "@/server/domain/orders";
import { db } from "@/server/db";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("customers");

  let data;
  try { data = await getCustomer(ctx.org.id, id); } catch { notFound(); }
  const { customer, orders, payments, prices, productsBought } = data;
  const { products } = await pickerData(ctx.org.id);
  const creditMinor = await getCustomerCredit(db, ctx.org.id, customer.id);

  const totalMinor = orders.reduce((a, o) => a + o.totalMinor, 0);
  const paidMinor = orders.reduce((a, o) => a + o.paidMinor, 0);
  const balanceMinor = totalMinor - paidMinor;
  const lastOrder = orders[0];

  return (
    <>
      <PageHeader
        title={customer.name}
        description={[customer.code, customer.phone, customer.email].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/customers/${customer.id}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
              <Pencil className="size-3.5" />Edit
            </Link>
            <RecordActions
              kind="CUSTOMER" id={customer.id} label={customer.name}
              archived={!!customer.archivedAt} returnTo="/customers"
              noun={ctx.config.t("customer").toLowerCase()}
            />
          </>
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total purchased" value={ctx.config.money(totalMinor)} sub={`${orders.length} ${ctx.config.t("order", "many").toLowerCase()}`} />
          <MetricCard label="Received" value={ctx.config.money(paidMinor)} tone="positive" />
          <MetricCard label="Outstanding" value={ctx.config.money(Math.max(balanceMinor, 0))} tone={balanceMinor > 0 ? "danger" : "positive"}
            sub={balanceMinor > 0 ? "Money still owed to you" : "All settled"} />
          {creditMinor > 0 ? (
            <MetricCard label="Credit available" value={ctx.config.money(creditMinor)} tone="positive"
              sub="Usable on their next order" />
          ) : (
            <MetricCard label={`Last ${ctx.config.t("order").toLowerCase()}`} value={lastOrder ? ctx.config.money(lastOrder.totalMinor) : "—"}
              sub={lastOrder?.orderDate ? formatDate(lastOrder.orderDate, ctx.config.dateFormat) : `No ${ctx.config.t("order", "many").toLowerCase()} yet`} />
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Card className="overflow-hidden">
              <CardHeader title={ctx.config.t("order", "many")} description={`${orders.length} recorded`} />
              <CustomerOrders
                rows={orders.map((o) => ({
                  id: o.id, number: o.number,
                  orderDate: isoDate(o.orderDate),
                  deliveryByDate: isoDate(o.deliveryByDate),
                  totalMinor: o.totalMinor, paidMinor: o.paidMinor,
                  balanceMinor: o.totalMinor - o.paidMinor,
                  paymentStatus: o.paymentStatus,
                  statusLabel: o.statusLabel, statusColor: o.statusColor, statusCompleted: o.statusCompleted,
                }))}
                customerId={customer.id}
                customerName={customer.name}
                methods={ctx.config.paymentMethods.filter((m) => m.isActive).map((m) => ({ id: m.id, label: m.label }))}
              />
            </Card>

            <Card>
              <CardHeader title="Payment history" />
              <CardBody>
                {payments.length === 0 ? (
                  <p className="text-[13px] text-ink-subtle">No payments recorded.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {payments.map((p) => (
                      <li key={p.payment.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                        <div>
                          <p className="font-medium tabular">{ctx.config.money(p.payment.amountMinor)}</p>
                          <p className="text-[12px] text-ink-subtle">
                            {p.orderNumber ?? "Unlinked"}{p.methodLabel ? ` · ${p.methodLabel}` : ""}
                          </p>
                        </div>
                        <span className="text-[12px] text-ink-subtle tabular">
                          {p.payment.paidAt ? new Date(p.payment.paidAt).toLocaleDateString("en-IN") : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <CustomerPricing
              customerId={customer.id}
              customerName={customer.name}
              products={products}
              rows={prices.map((p) => ({
                id: p.price.id, productId: p.price.productId, productName: p.productName,
                productDefaultMinor: p.productDefault ?? null,
                priceMinor: p.price.priceMinor, discountPercent: p.price.discountPercent, note: p.price.note,
              }))}
            />

            <Card>
              <CardHeader title={`${ctx.config.t("product", "many")} bought`} />
              <CardBody>
                {productsBought.length === 0 ? (
                  <p className="text-[13px] text-ink-subtle">Nothing yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {productsBought.map((p) => (
                      <li key={p.name} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 tabular text-ink-muted">
                          {Number(p.quantity)} · {ctx.config.money(Number(p.revenue))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {customer.notes || customer.address ? (
              <Card>
                <CardHeader title="Notes" />
                <CardBody className="space-y-2 text-[13px] whitespace-pre-wrap">
                  {customer.address ? <p className="text-ink-muted">{customer.address}</p> : null}
                  {customer.notes ? <p>{customer.notes}</p> : null}
                </CardBody>
              </Card>
            ) : null}
          </div>
        </div>
      </PageBody>
    </>
  );
}
