"use client";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { Column, DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/components/config-provider";
import { useToast } from "@/components/ui/toast";
import { recordBulkActions } from "@/components/bulk-record-actions";

type Row = {
  id: string; code: string; date: string | null; description: string;
  amountMinor: number; vendor: string | null; notes: string | null;
  categoryId: string | null; categoryName: string | null;
  methodId: string | null; methodLabel: string | null;
};

export function ExpensesTable({ rows, categories, methods, archived = false }: {
  rows: Row[]; categories: { id: string; name: string }[]; methods: { id: string; label: string }[];
  archived?: boolean;
}) {
  const { money, date, t, can } = useConfig();
  const router = useRouter();
  const toast = useToast();

  const columns: Column<Row>[] = [
    { key: "date", header: "Date", width: "120px", value: (r) => r.date ?? "", cell: (r) => <span className="whitespace-nowrap">{date(r.date)}</span> },
    { key: "description", header: "What", mobilePrimary: true, value: (r) => r.description, cell: (r) => <span className="font-medium">{r.description}</span> },
    { key: "category", header: "Category", width: "160px", value: (r) => r.categoryName ?? "", cell: (r) => r.categoryName ? <Badge color="slate">{r.categoryName}</Badge> : <span className="text-ink-subtle">—</span> },
    { key: "vendor", header: "Vendor", defaultHidden: true, value: (r) => r.vendor ?? "" },
    { key: "method", header: "Paid by", width: "120px", value: (r) => r.methodLabel ?? "", cell: (r) => r.methodLabel ?? <span className="text-ink-subtle">—</span> },
    { key: "amount", header: "Amount", align: "right", width: "120px", value: (r) => r.amountMinor, cell: (r) => <span className="font-medium">{money(r.amountMinor)}</span> },
  ];

  return (
    <DataTable
      rows={rows} columns={columns} storageKey="expenses" exportName="expenses"
      searchable={(r) => [r.description, r.vendor, r.categoryName, r.notes, r.code].filter(Boolean).join(" ")}
      onRowClick={(r) => router.push(`/expenses/${r.id}/edit`)}
      emptyIcon={Receipt}
      emptyTitle={`No ${t("expense", "many").toLowerCase()} yet`}
      emptyDescription="Record what you spend so your profit picture is real."
      emptyAction={<a href="/expenses/new" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white">Add {t("expense").toLowerCase()}</a>}
      bulkActions={recordBulkActions<Row>({
        kind: "EXPENSE", archived,
        canArchive: can("record:archive"), canDelete: can("record:delete"),
        onDone: () => router.refresh(),
        notify: (message, tone) => toast.push(message, tone),
      })}
      filters={[
        { key: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })), match: (r, v) => r.categoryId === v },
        { key: "method", label: "Paid by", options: methods.map((m) => ({ value: m.id, label: m.label })), match: (r, v) => r.methodId === v },
      ]}
    />
  );
}
