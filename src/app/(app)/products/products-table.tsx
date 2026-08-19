"use client";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { Column, DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/components/config-provider";
import { useToast } from "@/components/ui/toast";
import { recordBulkActions } from "@/components/bulk-record-actions";

type Row = {
  id: string; code: string; name: string; categoryId: string | null; categoryName: string | null;
  defaultPriceMinor: number; costMinor: number | null; unit: string; isActive: boolean;
  soldQuantity: number; soldRevenue: number;
};

export function ProductsTable({ rows, categories, showCost, archived = false }: {
  rows: Row[]; categories: { id: string; name: string }[]; showCost: boolean; archived?: boolean;
}) {
  const { money, t, can } = useConfig();
  const router = useRouter();
  const toast = useToast();

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", mobilePrimary: true, value: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "category", header: "Category", width: "150px", value: (r) => r.categoryName ?? "", cell: (r) => r.categoryName ? <Badge color="slate">{r.categoryName}</Badge> : <span className="text-ink-subtle">—</span> },
    { key: "price", header: "Default price", align: "right", width: "130px", value: (r) => r.defaultPriceMinor, cell: (r) => money(r.defaultPriceMinor) },
    ...(showCost ? [{ key: "cost", header: "Cost", align: "right" as const, width: "110px", value: (r: Row) => r.costMinor ?? 0, cell: (r: Row) => r.costMinor !== null ? money(r.costMinor) : <span className="text-ink-subtle">—</span> }] : []),
    { key: "unit", header: "Unit", width: "80px", defaultHidden: true, value: (r) => r.unit },
    { key: "sold", header: "Sold", align: "right", width: "90px", value: (r) => r.soldQuantity },
    { key: "revenue", header: "Revenue", align: "right", width: "120px", value: (r) => r.soldRevenue, cell: (r) => money(r.soldRevenue) },
    { key: "active", header: "Status", width: "100px", value: (r) => (r.isActive ? "Active" : "Inactive"), cell: (r) => <Badge color={r.isActive ? "emerald" : "neutral"} dot>{r.isActive ? "Active" : "Inactive"}</Badge> },
  ];

  return (
    <DataTable
      rows={rows} columns={columns} storageKey="products" exportName="products"
      searchable={(r) => [r.name, r.code, r.categoryName].filter(Boolean).join(" ")}
      onRowClick={(r) => router.push(`/products/${r.id}`)}
      emptyIcon={Package}
      emptyTitle={`No ${t("product", "many").toLowerCase()} yet`}
      emptyDescription={`Add what you sell so ${t("order", "many").toLowerCase()} can be created quickly.`}
      emptyAction={<a href="/products/new" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white">Add {t("product").toLowerCase()}</a>}
      bulkActions={recordBulkActions<Row>({
        kind: "PRODUCT", archived,
        canArchive: can("record:archive"), canDelete: can("record:delete"),
        onDone: () => router.refresh(),
        notify: (message, tone) => toast.push(message, tone),
      })}
      filters={[
        { key: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })), match: (r, v) => r.categoryId === v },
        { key: "active", label: "Status", options: [{ value: "1", label: "Active" }, { value: "0", label: "Inactive" }], match: (r, v) => String(Number(r.isActive)) === v },
      ]}
    />
  );
}
