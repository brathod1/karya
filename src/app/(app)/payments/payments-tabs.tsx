"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Column, DataTable } from "@/components/data-table";
import { BalanceBadge } from "@/components/balance-badge";
import { EmptyState } from "@/components/ui/empty";
import { useConfig } from "@/components/config-provider";
import { cn } from "@/lib/cn";
import { differenceInCalendarDays } from "date-fns";

type PaymentRow = {
  id: string; amountMinor: number; paidAt: string | null; reference: string | null; note: string | null;
  kind: string; voidedAt: Date | null; methodLabel: string | null;
  orderId: string | null; orderNumber: string | null;
  customerId: string | null; customerName: string | null;
};

type OwingRow = {
  customerId: string; name: string; phone: string | null;
  balanceMinor: number; orderCount: number; lastOrderDate: string | null;
};

export function PaymentsTabs({ payments, owing }: { payments: PaymentRow[]; owing: OwingRow[] }) {
  const { money, date, t } = useConfig();
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "owing">(owing.length > 0 ? "owing" : "all");

  const paymentColumns: Column<PaymentRow>[] = [
    { key: "paidAt", header: "Date", width: "120px", value: (r) => r.paidAt ?? "", cell: (r) => date(r.paidAt) },
    {
      key: "amount", header: "Amount", align: "right", width: "120px", mobilePrimary: true, value: (r) => r.amountMinor,
      cell: (r) => (
        <span className={cn("font-medium tabular", r.voidedAt && "line-through opacity-50", r.kind === "REFUND" && "text-red-700")}>
          {r.kind === "REFUND" ? "− " : ""}{money(Math.abs(r.amountMinor))}
        </span>
      ),
    },
    { key: "customer", header: t("customer"), value: (r) => r.customerName ?? "", cell: (r) => r.customerName ?? <span className="text-ink-subtle">—</span> },
    {
      key: "order", header: t("order"), width: "130px", value: (r) => r.orderNumber ?? "",
      cell: (r) => r.orderNumber
        ? <Link href={`/orders/${r.orderId}`} className="tabular hover:underline" onClick={(e) => e.stopPropagation()}>{r.orderNumber}</Link>
        : <span className="text-ink-subtle">—</span>,
    },
    { key: "method", header: "Method", width: "120px", value: (r) => r.methodLabel ?? "", cell: (r) => r.methodLabel ?? <span className="text-ink-subtle">—</span> },
    { key: "reference", header: "Reference", defaultHidden: true, value: (r) => r.reference ?? "" },
    { key: "note", header: "Note", defaultHidden: true, value: (r) => r.note ?? "" },
  ];

  const owingColumns: Column<OwingRow>[] = [
    { key: "name", header: t("customer"), mobilePrimary: true, value: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "phone", header: "Phone", width: "150px", value: (r) => r.phone ?? "", cell: (r) => r.phone ?? <span className="text-ink-subtle">—</span> },
    { key: "orders", header: `Open ${t("order", "many").toLowerCase()}`, align: "right", width: "120px", value: (r) => r.orderCount },
    {
      key: "age", header: "Waiting", width: "120px",
      value: (r) => (r.lastOrderDate ? -differenceInCalendarDays(new Date(), new Date(r.lastOrderDate)) : 0),
      cell: (r) => {
        if (!r.lastOrderDate) return <span className="text-ink-subtle">—</span>;
        const days = differenceInCalendarDays(new Date(), new Date(r.lastOrderDate));
        return <span className={cn("tabular", days > 30 && "text-red-700 font-medium")}>{days} days</span>;
      },
    },
    { key: "balance", header: "Owed", align: "right", width: "150px", value: (r) => r.balanceMinor, cell: (r) => <BalanceBadge status="UNPAID" balanceMinor={r.balanceMinor} size="sm" /> },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-1 border-b border-line px-3 pt-2">
        <TabButton active={tab === "owing"} onClick={() => setTab("owing")}>
          {t("customer", "many")} who owe you{owing.length ? ` (${owing.length})` : ""}
        </TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>All {t("payment", "many").toLowerCase()}</TabButton>
      </div>

      {tab === "all" ? (
        <DataTable
          rows={payments} columns={paymentColumns} storageKey="payments" exportName="payments"
          searchable={(r) => [r.customerName, r.orderNumber, r.methodLabel, r.reference, r.note].filter(Boolean).join(" ")}
          emptyIcon={Wallet}
          emptyTitle={`No ${t("payment", "many").toLowerCase()} yet`}
          emptyDescription={`They appear here as you record them against ${t("order", "many").toLowerCase()}.`}
        />
      ) : owing.length === 0 ? (
        <EmptyState title="Everyone has paid" description="No outstanding balances. Nice." />
      ) : (
        <DataTable
          rows={owing.map((o) => ({ ...o, id: o.customerId }))}
          columns={owingColumns as Column<OwingRow & { id: string }>[]}
          storageKey="owing" exportName="outstanding-balances"
          searchable={(r) => [r.name, r.phone].filter(Boolean).join(" ")}
          onRowClick={(r) => router.push(`/customers/${r.customerId}`)}
        />
      )}
    </Card>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("rounded-t-lg px-3.5 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px",
        active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink")}>
      {children}
    </button>
  );
}
