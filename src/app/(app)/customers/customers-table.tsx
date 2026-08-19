"use client";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Column, DataTable } from "@/components/data-table";
import { BalanceBadge } from "@/components/balance-badge";
import { useConfig } from "@/components/config-provider";
import { useToast } from "@/components/ui/toast";
import { recordBulkActions } from "@/components/bulk-record-actions";

type Row = {
  id: string; code: string; name: string; phone: string | null; email: string | null;
  orderCount: number; totalMinor: number; paidMinor: number; balanceMinor: number;
  lastOrderDate: string | null; tags: string[];
};

export function CustomersTable({ rows, archived = false }: { rows: Row[]; archived?: boolean }) {
  const { money, date, t, can } = useConfig();
  const router = useRouter();
  const toast = useToast();

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", mobilePrimary: true, value: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "code", header: "ID", width: "110px", defaultHidden: true, value: (r) => r.code, cell: (r) => <span className="tabular text-ink-subtle">{r.code}</span> },
    { key: "phone", header: "Phone", width: "150px", value: (r) => r.phone ?? "", cell: (r) => r.phone ?? <span className="text-ink-subtle">—</span> },
    { key: "email", header: "Email", defaultHidden: true, value: (r) => r.email ?? "" },
    { key: "orders", header: t("order", "many"), align: "right", width: "90px", value: (r) => r.orderCount },
    { key: "total", header: "Total purchased", align: "right", width: "140px", value: (r) => r.totalMinor, cell: (r) => money(r.totalMinor) },
    {
      key: "balance", header: "Outstanding", align: "right", width: "150px", value: (r) => r.balanceMinor,
      cell: (r) => r.balanceMinor > 0
        ? <BalanceBadge status="UNPAID" balanceMinor={r.balanceMinor} size="sm" />
        : <span className="text-ink-subtle">—</span>,
    },
    { key: "last", header: `Last ${t("order").toLowerCase()}`, width: "130px", value: (r) => r.lastOrderDate ?? "", cell: (r) => r.lastOrderDate ? date(r.lastOrderDate) : <span className="text-ink-subtle">Never</span> },
  ];

  return (
    <DataTable
      rows={rows} columns={columns} storageKey="customers" exportName="customers"
      searchable={(r) => [r.name, r.phone, r.email, r.code, ...(r.tags ?? [])].filter(Boolean).join(" ")}
      onRowClick={(r) => router.push(`/customers/${r.id}`)}
      emptyIcon={Users}
      emptyTitle={`No ${t("customer", "many").toLowerCase()} yet`}
      emptyDescription="Add them as you go, or import your existing list from a spreadsheet."
      emptyAction={
        <>
          <a href="/customers/new" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white">Add {t("customer").toLowerCase()}</a>
          <a href="/import" className="inline-flex h-9 items-center rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong">Import</a>
        </>
      }
      bulkActions={recordBulkActions<Row>({
        kind: "CUSTOMER", archived,
        canArchive: can("record:archive"), canDelete: can("record:delete"),
        onDone: () => router.refresh(),
        notify: (message, tone) => toast.push(message, tone),
      })}
      filters={[{
        key: "balance", label: "Payment",
        options: [{ value: "owing", label: "Owes money" }, { value: "clear", label: "All settled" }],
        match: (r, v) => (v === "owing" ? r.balanceMinor > 0 : r.balanceMinor <= 0),
      }]}
    />
  );
}
