import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireModule } from "@/server/context";
import { getProduct } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { formatDate } from "@/lib/format";
import { RecordActions } from "@/components/record-actions";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("products");

  let data;
  try { data = await getProduct(ctx.org.id, id); } catch { notFound(); }
  const { product, prices, history } = data;

  const soldQty = history.reduce((a, h) => a + h.quantity, 0);
  const revenue = history.reduce((a, h) => a + h.lineTotalMinor, 0);

  return (
    <>
      <PageHeader
        title={product.name}
        description={[product.code, product.description].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/products/${product.id}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
              <Pencil className="size-3.5" />Edit
            </Link>
            <RecordActions
              kind="PRODUCT" id={product.id} label={product.name}
              archived={!!product.archivedAt} returnTo="/products"
              noun={ctx.config.t("product").toLowerCase()}
            />
          </>
        }
      />
      <PageBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Default price" value={ctx.config.money(product.defaultPriceMinor)} sub={`per ${product.unit}`} />
          <MetricCard label="Sold" value={String(soldQty)} sub="all time" />
          <MetricCard label="Revenue" value={ctx.config.money(revenue)} />
          {ctx.config.settings.pricing.enableCostTracking ? (
            <MetricCard label="Cost" value={product.costMinor !== null ? ctx.config.money(product.costMinor) : "Not set"}
              sub={product.costMinor !== null ? `Margin ${Math.round(((product.defaultPriceMinor - product.costMinor) / Math.max(product.defaultPriceMinor, 1)) * 100)}%` : "Add a cost to see margin"} />
          ) : (
            <MetricCard label="Agreed prices" value={String(prices.length)} sub={`${ctx.config.t("customer", "many").toLowerCase()} with their own price`} />
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Recent sales" description="Every line keeps the price it was sold at." />
            <CardBody>
              {history.length === 0 ? (
                <p className="text-[13px] text-ink-subtle">Not sold yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {history.map((h, i) => (
                    <li key={`${h.orderId}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                      <div className="min-w-0">
                        <Link href={`/orders/${h.orderId}`} className="font-medium tabular hover:underline">{h.number}</Link>
                        <p className="truncate text-[12px] text-ink-subtle">
                          {h.customerName ?? "Walk-in"} · {formatDate(h.orderDate, ctx.config.dateFormat)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right tabular">
                        <p>{h.quantity} × {ctx.config.money(h.unitPriceMinor)}</p>
                        <p className="text-[12px] text-ink-subtle">{ctx.config.money(h.lineTotalMinor)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Agreed prices" description={`${ctx.config.t("customer", "many")} who pay a different price.`} />
            <CardBody>
              {prices.length === 0 ? (
                <p className="text-[13px] text-ink-subtle">Everyone pays the catalogue price.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {prices.map((p) => (
                    <li key={p.price.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                      <span className="truncate">{p.customerName}</span>
                      <span className="shrink-0 tabular font-medium">
                        {p.price.priceMinor !== null ? ctx.config.money(p.price.priceMinor) : `${p.price.discountPercent}% off`}
                      </span>
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
