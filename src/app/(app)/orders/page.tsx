import { profile } from "@/server/db/instrument";
import Link from "next/link";
import { Hammer, Plus } from "lucide-react";
import { requireModule } from "@/server/context";
import { countArchived, listOrders } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { OrdersTable } from "./orders-table";

async function OrdersPageInner({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const ctx = await requireModule("orders");
  const [rows, archivedCount] = await Promise.all([
    listOrders(ctx.org.id, { includeArchived: showArchived }),
    showArchived ? Promise.resolve(0) : countArchived(ctx.org.id, "orders"),
  ]);

  const total = rows[0]?.totalCount ?? rows.length;
  const truncated = total > rows.length;

  const one = ctx.config.t("order").toLowerCase();
  const many = ctx.config.t("order", "many").toLowerCase();

  return (
    <>
      <PageHeader
        title={showArchived ? `Archived ${many}` : ctx.config.t("order", "many")}
        description={showArchived
          ? `${rows.length} archived · hidden from lists and excluded from every total`
          : truncated
            ? `Showing the ${rows.length} most recent of ${total} ${many} · ${rows.filter((r) => r.paymentStatus !== "PAID").length} of these still owing`
            : `${rows.length} ${rows.length === 1 ? one : many} · ${rows.filter((r) => r.paymentStatus !== "PAID").length} with money still due`}
        actions={
          showArchived ? (
            <Link href="/orders" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong transition-colors hover:bg-stone-50">
              ← Back to active
            </Link>
          ) : (
            <>
              {archivedCount > 0 ? (
                <Link href="/orders?archived=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong transition-colors hover:bg-stone-50">
                  Archived ({archivedCount})
                </Link>
              ) : null}
              <Link href="/orders/to-make" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong transition-colors hover:bg-stone-50">
                <Hammer className="size-4" />To make
              </Link>
              <Link href="/orders/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover">
                <Plus className="size-4" />New {one}
              </Link>
            </>
          )
        }
      />
      <PageBody>
        <Card className="overflow-hidden">
          <OrdersTable
            rows={rows}
            statuses={ctx.config.orderStatuses.map((s) => ({
              id: s.id, label: s.label, color: s.color, isCompleted: s.isCompleted, isActive: s.isActive,
            }))}
            methods={ctx.config.paymentMethods.filter((m) => m.isActive).map((m) => ({ id: m.id, label: m.label }))}
            lineDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "ORDER_ITEM" && f.isActive).map((f) => ({
              id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
              isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
            }))}
            archived={showArchived}
          />
        </Card>
      </PageBody>
    </>
  );
}

/**
 * Reports this page's database use when profiling is on (development, or
 * KARYA_PROFILE=1), so a slow screen can be diagnosed with numbers.
 */
export default async function Page(props: { searchParams: Promise<{ archived?: string }> }) {
  return profile("Orders", () => OrdersPageInner(props));
}
