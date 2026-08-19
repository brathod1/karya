import { profile } from "@/server/db/instrument";
import Link from "next/link";
import { requireModule } from "@/server/context";
import { productionQueue } from "@/server/queries";
import { openStatusIds } from "@/server/domain/config";
import { attributeSignature, formatLineAttributes } from "@/server/domain/lineAttributes";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { ToMakeTable, type MakeRow } from "./to-make-table";
import { Hammer } from "lucide-react";

/**
 * The morning list: everything still to be made, gathered across all open
 * orders. Seven red cotton bandanas ordered by four different people is one job
 * of seven, not four things to remember separately.
 */
async function ToMakePageInner() {
  const ctx = await requireModule("orders");
  const lines = await productionQueue(ctx.org.id, openStatusIds(ctx.config));

  const lineDefs = ctx.config.fieldDefs
    .filter((f) => f.entityType === "ORDER_ITEM" && f.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((f) => ({
      key: f.key, label: f.label, type: f.type,
      options: f.options as { value: string; label: string }[] | null,
    }));

  const grouped = new Map<string, MakeRow>();
  for (const line of lines) {
    const key = attributeSignature(line.name, line.attributes);
    const existing = grouped.get(key);
    const detail = formatLineAttributes(lineDefs, line.attributes);

    const order = {
      id: line.orderId, number: line.orderNumber, quantity: line.quantity,
      customerName: line.customerName, deliveryByDate: line.deliveryByDate,
      statusLabel: line.statusLabel, statusColor: line.statusColor,
    };

    if (existing) {
      existing.quantity += line.quantity;
      existing.orders.push(order);
      if (line.deliveryByDate && (!existing.dueBy || line.deliveryByDate < existing.dueBy)) {
        existing.dueBy = line.deliveryByDate;
      }
    } else {
      grouped.set(key, {
        id: key, name: line.name, detail,
        quantity: line.quantity, dueBy: line.deliveryByDate, orders: [order],
      });
    }
  }

  const rows = [...grouped.values()].sort((a, b) => {
    if (a.dueBy && b.dueBy) return a.dueBy.localeCompare(b.dueBy);
    if (a.dueBy) return -1;
    if (b.dueBy) return 1;
    return b.quantity - a.quantity;
  });

  const totalPieces = rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <>
      <PageHeader
        title="To make"
        description={rows.length === 0
          ? "Nothing outstanding."
          : `${totalPieces} ${totalPieces === 1 ? "piece" : "pieces"} across ${rows.length} ${rows.length === 1 ? "job" : "jobs"}, from ${ctx.config.t("order", "many").toLowerCase()} not yet finished`}
        actions={
          <Link href="/orders" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong transition-colors hover:bg-stone-50">
            ← All {ctx.config.t("order", "many").toLowerCase()}
          </Link>
        }
      />
      <PageBody>
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={Hammer}
              title="Nothing to make"
              description={`Every ${ctx.config.t("order").toLowerCase()} is at a finished status. New ones appear here as they come in.`}
              action={<Link href="/orders/new" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white">New {ctx.config.t("order").toLowerCase()}</Link>}
            />
          ) : (
            <ToMakeTable rows={rows} />
          )}
        </Card>
      </PageBody>
    </>
  );
}

/**
 * Reports this page's database use when profiling is on (development, or
 * KARYA_PROFILE=1), so a slow screen can be diagnosed with numbers.
 */
export default async function ToMakePage() {
  return profile("To make", () => ToMakePageInner());
}
