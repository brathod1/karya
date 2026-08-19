import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireModule } from "@/server/context";
import { getEvent, pickerData } from "@/server/queries";
import { computeEventProgress } from "@/server/domain/events";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ProgressRing } from "@/components/progress";
import { MetricCard } from "@/components/metric-card";
import { ProductionPlan } from "./production-plan";
import { formatDate } from "@/lib/format";
import { RecordActions } from "@/components/record-actions";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("events");

  let data;
  try { data = await getEvent(ctx.org.id, id); } catch { notFound(); }
  const { event, items } = data;
  const { products } = await pickerData(ctx.org.id);

  const progress = computeEventProgress(items.map((i) => i.item), ctx.config.settings.events.completeThresholdPct);

  return (
    <>
      <PageHeader
        title={event.name}
        description={[
          event.startDate ? formatDate(event.startDate, ctx.config.dateFormat) : null,
          event.location,
          event.code,
        ].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/events/${event.id}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
              <Pencil className="size-3.5" />Edit
            </Link>
            <RecordActions
              kind="EVENT" id={event.id} label={event.name}
              archived={!!event.archivedAt} returnTo="/events"
              noun={ctx.config.t("event").toLowerCase()}
            />
          </>
        }
      />
      <PageBody className="space-y-4">
        <Card>
          <CardBody className="flex flex-wrap items-center gap-6 pt-5">
            <ProgressRing value={progress.progressPct} caption={`${progress.totalCompleted} / ${progress.totalPlanned}`} sub="made" />
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <MetricCard label="Left to make" value={String(progress.totalRemaining)} sub={`across ${progress.linesTotal} ${progress.linesTotal === 1 ? "line" : "lines"}`} tone={progress.totalRemaining > 0 ? "warning" : "positive"} />
              <MetricCard label="Expected revenue" value={ctx.config.money(progress.expectedRevenueMinor)} sub="if everything sells" />
              <MetricCard label="Ready to sell" value={ctx.config.money(progress.completedValueMinor)} sub={`${progress.linesComplete} of ${progress.linesTotal} lines complete`} tone="positive" />
            </div>
          </CardBody>
        </Card>

        <ProductionPlan
          eventId={event.id}
          products={products}
          categories={ctx.config.productCategories.map((c) => ({ id: c.id, name: c.name }))}
          threshold={ctx.config.settings.events.completeThresholdPct}
          rows={items.map(({ item, categoryName }) => ({
            id: item.id, productId: item.productId, name: item.productNameSnapshot,
            categoryId: item.categoryId, categoryName,
            quantityPlanned: item.quantityPlanned, quantityCompleted: item.quantityCompleted,
            unitPriceMinor: item.unitPriceMinor, note: item.note,
          }))}
        />

        {event.notes ? (
          <Card>
            <CardBody className="pt-5 text-[13px] whitespace-pre-wrap">{event.notes}</CardBody>
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}
