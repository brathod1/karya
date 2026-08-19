import { profile } from "@/server/db/instrument";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireModule } from "@/server/context";
import { countArchived, listCustomers } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { CustomersTable } from "./customers-table";

async function CustomersPageInner({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const ctx = await requireModule("customers");
  const [rows, archivedCount] = await Promise.all([
    listCustomers(ctx.org.id, { includeArchived: showArchived }),
    showArchived ? Promise.resolve(0) : countArchived(ctx.org.id, "customers"),
  ]);
  const owing = rows.filter((r) => r.balanceMinor > 0).length;

  return (
    <>
      <PageHeader
        title={showArchived ? `Archived ${ctx.config.t("customer", "many").toLowerCase()}` : ctx.config.t("customer", "many")}
        description={showArchived
          ? `${rows.length} archived · hidden from lists and pickers`
          : `${rows.length} total · ${owing} with money outstanding`}
        actions={
          showArchived ? (
            <Link href="/customers" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
              ← Back to active
            </Link>
          ) : (
            <>
              {archivedCount > 0 ? (
                <Link href="/customers?archived=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
                  Archived ({archivedCount})
                </Link>
              ) : null}
              <Link href="/customers/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white hover:bg-brand-hover">
                <Plus className="size-4" />New {ctx.config.t("customer").toLowerCase()}
              </Link>
            </>
          )
        }
      />
      <PageBody>
        <Card className="overflow-hidden"><CustomersTable rows={rows} archived={showArchived} /></Card>
      </PageBody>
    </>
  );
}

/**
 * Reports this page's database use when profiling is on (development, or
 * KARYA_PROFILE=1), so a slow screen can be diagnosed with numbers.
 */
export default async function Page(props: { searchParams: Promise<{ archived?: string }> }) {
  return profile("Customers", () => CustomersPageInner(props));
}
