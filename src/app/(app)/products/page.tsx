import { profile } from "@/server/db/instrument";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireModule } from "@/server/context";
import { countArchived, listProducts } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ProductsTable } from "./products-table";

async function ProductsPageInner({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const ctx = await requireModule("products");
  const [rows, archivedCount] = await Promise.all([
    listProducts(ctx.org.id, { includeArchived: showArchived }),
    showArchived ? Promise.resolve(0) : countArchived(ctx.org.id, "products"),
  ]);

  return (
    <>
      <PageHeader
        title={showArchived ? `Archived ${ctx.config.t("product", "many").toLowerCase()}` : ctx.config.t("product", "many")}
        description={showArchived ? `${rows.length} archived · kept on past orders, hidden from pickers` : `${rows.length} in your catalogue`}
        actions={
          showArchived ? (
            <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
              ← Back to active
            </Link>
          ) : (
            <>
              {archivedCount > 0 ? (
                <Link href="/products?archived=1" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong hover:bg-stone-50">
                  Archived ({archivedCount})
                </Link>
              ) : null}
              <Link href="/products/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white hover:bg-brand-hover">
                <Plus className="size-4" />New {ctx.config.t("product").toLowerCase()}
              </Link>
            </>
          )
        }
      />
      <PageBody>
        <Card className="overflow-hidden">
          <ProductsTable
            rows={rows}
            categories={ctx.config.productCategories.map((c) => ({ id: c.id, name: c.name }))}
            showCost={ctx.config.settings.pricing.enableCostTracking}
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
  return profile("Products", () => ProductsPageInner(props));
}
