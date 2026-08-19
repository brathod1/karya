import { profile } from "@/server/db/instrument";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireModule } from "@/server/context";
import { countArchived, listExpenses } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ExpensesTable } from "./expenses-table";
import { isoDate, startOfCalendarMonth } from "@/lib/dates";

async function ExpensesPageInner({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const ctx = await requireModule("expenses");
  const [rows, archivedCount] = await Promise.all([
    listExpenses(ctx.org.id, { includeArchived: showArchived }),
    showArchived ? Promise.resolve(0) : countArchived(ctx.org.id, "expenses"),
  ]);
  const monthFrom = isoDate(startOfCalendarMonth(new Date())) ?? "";
  const thisMonth = rows.filter((r) => r.date && r.date >= monthFrom).reduce((a, r) => a + r.amountMinor, 0);

  return (
    <>
      <PageHeader
        title={ctx.config.t("expense", "many")}
        description={`${ctx.config.money(thisMonth)} this month · ${ctx.config.money(rows.reduce((a, r) => a + r.amountMinor, 0))} all time`}
        actions={
          showArchived ? (
            <Link href="/expenses" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
              ← Back to active
            </Link>
          ) : (
            <>
              {archivedCount > 0 ? (
                <Link href="/expenses?archived=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
                  Archived ({archivedCount})
                </Link>
              ) : null}
              <Link href="/expenses/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white hover:bg-brand-hover">
                <Plus className="size-4" />Add {ctx.config.t("expense").toLowerCase()}
              </Link>
            </>
          )
        }
      />
      <PageBody>
        <Card className="overflow-hidden">
          <ExpensesTable
            rows={rows}
            categories={ctx.config.expenseCategories.map((c) => ({ id: c.id, name: c.name }))}
            methods={ctx.config.paymentMethods.map((m) => ({ id: m.id, label: m.label }))}
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
  return profile("Expenses", () => ExpensesPageInner(props));
}
