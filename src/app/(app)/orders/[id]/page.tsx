import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { requireModule } from "@/server/context";
import { getOrder } from "@/server/queries";
import { loadCustomFieldValues } from "@/server/domain/fields";
import { db } from "@/server/db";
import { displayCustomValue } from "@/server/domain/customFields";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { OrderDetailClient } from "./order-detail-client";
import { OrderAttachments } from "./order-attachments";
import { formatDateTime } from "@/lib/format";
import { isoDate } from "@/lib/dates";
import { formatLineAttributes } from "@/server/domain/lineAttributes";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("orders");

  let data;
  try {
    data = await getOrder(ctx.org.id, id);
  } catch {
    notFound();
  }

  const { order, items, payments, customer, activity } = data;
  const status = ctx.config.orderStatuses.find((s) => s.id === order.statusId) ?? null;
  const customValues = (await loadCustomFieldValues(db, ctx.org.id, "ORDER", [id])).get(id) ?? {};
  const orderFieldDefs = ctx.config.fieldDefs.filter((f) => f.entityType === "ORDER" && f.isActive);
  const lineDefs = ctx.config.fieldDefs
    .filter((f) => f.entityType === "ORDER_ITEM" && f.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({
      key: f.key, label: f.label, type: f.type,
      options: f.options as { value: string; label: string }[] | null,
    }));

  return (
    <>
      <PageHeader
        title={order.number}
        description={customer ? `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}` : "Walk-in"}
        actions={
          <>
            <Link href="/orders" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
              <ArrowLeft className="size-3.5" />Back
            </Link>
            <Link href={`/orders/${order.id}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
              <Pencil className="size-3.5" />Edit
            </Link>
          </>
        }
      />

      <PageBody>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <OrderDetailClient
              order={{
                id: order.id, number: order.number, totalMinor: order.totalMinor, paidMinor: order.paidMinor,
                paymentStatus: order.paymentStatus, statusId: order.statusId,
                orderDate: isoDate(order.orderDate),
                deliveryByDate: isoDate(order.deliveryByDate),
                deliveryTime: order.deliveryTime,
                subtotalMinor: order.subtotalMinor, discountMinor: order.discountMinor,
                additionalChargesMinor: order.additionalChargesMinor, taxMinor: order.taxMinor,
                note: order.note, internalNote: order.internalNote, customerNote: order.customerNote,
                customerId: order.customerId,
                customerName: customer?.name ?? null,
                archivedAt: order.archivedAt ? order.archivedAt.toISOString() : null,
                statusCompleted: status?.isCompleted ?? false,
              }}
              items={items.map((i) => ({
                id: i.id, name: i.productNameSnapshot, quantity: i.quantity,
                unitPriceMinor: i.unitPriceMinor, lineTotalMinor: i.lineTotalMinor,
                priceSource: i.priceSource, note: i.note,
                detail: formatLineAttributes(lineDefs, i.attributes),
              }))}
              payments={payments.map((p) => ({
                id: p.payment.id, amountMinor: p.payment.amountMinor,
                paidAt: isoDate(p.payment.paidAt), methodLabel: p.methodLabel,
                reference: p.payment.reference, note: p.payment.note,
                kind: p.payment.kind, voidedAt: p.payment.voidedAt?.toISOString() ?? null,
              }))}
              statuses={ctx.config.orderStatuses.map((s) => ({
                id: s.id, label: s.label, color: s.color, isCompleted: s.isCompleted, isActive: s.isActive,
              }))}
              methods={ctx.config.paymentMethods.filter((m) => m.isActive).map((m) => ({ id: m.id, label: m.label }))}
            />

            {orderFieldDefs.length > 0 ? (
              <Card>
                <CardHeader title="More details" />
                <CardBody>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {orderFieldDefs.map((def) => (
                      <div key={def.id}>
                        <dt className="text-[12px] uppercase tracking-wide text-ink-subtle">{def.label}</dt>
                        <dd className="mt-0.5 text-sm">{displayCustomValue(def, customValues[def.key], ctx.config.money)}</dd>
                      </div>
                    ))}
                  </dl>
                </CardBody>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Timeline" description={`Everything that has happened to this ${ctx.config.t("order").toLowerCase()}.`} />
              <CardBody>
                {activity.length === 0 ? (
                  <p className="text-[13px] text-ink-subtle">Nothing recorded yet.</p>
                ) : (
                  <ol className="relative space-y-4 border-l border-line pl-4">
                    {activity.map((entry) => (
                      <li key={entry.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-brand ring-2 ring-white" />
                        <p className="text-[13px] text-ink">{entry.message}</p>
                        <p className="text-[11.5px] text-ink-subtle tabular">
                          {formatDateTime(entry.createdAt, ctx.config.dateFormat + ", HH:mm")}
                          {entry.actorName ? ` · ${entry.actorName}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardBody>
            </Card>

            <OrderAttachments orderId={order.id} />

            {customer ? (
              <Card>
                <CardHeader title={ctx.config.t("customer")} action={
                  <Link href={`/customers/${customer.id}`} className="text-[12.5px] font-medium text-brand hover:underline">View</Link>
                } />
                <CardBody className="space-y-1.5 text-[13px]">
                  <p className="font-medium">{customer.name}</p>
                  {customer.phone ? <p className="text-ink-muted">{customer.phone}</p> : null}
                  {customer.email ? <p className="text-ink-muted">{customer.email}</p> : null}
                  {customer.address ? <p className="text-ink-muted">{customer.address}</p> : null}
                </CardBody>
              </Card>
            ) : null}
          </div>
        </div>
      </PageBody>
    </>
  );
}
