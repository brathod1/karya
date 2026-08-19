"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, CheckCheck, RotateCcw, ShoppingBag, Trash2 } from "lucide-react";
import { Column, DataTable, FilterDef } from "@/components/data-table";
import { BalanceBadge } from "@/components/balance-badge";
import { DeliveryChip } from "@/components/delivery-chip";
import { StatusPicker, type StatusOption } from "@/components/status-chip";
import { RecordPaymentSheet, type PaymentTarget } from "@/components/record-payment-sheet";
import { useConfig } from "@/components/config-provider";
import { useToast } from "@/components/ui/toast";
import {
  bulkArchiveOrdersAction, bulkChangeStatusAction, bulkDeleteOrdersAction, changeStatusAction,
} from "@/server/actions/orders";
import { deliveryState } from "@/lib/format";
import { formatLineAttributes } from "@/server/domain/lineAttributes";
import type { FieldDef } from "@/components/custom-fields";

export type OrderRow = {
  id: string; number: string; orderDate: string | null; deliveryByDate: string | null;
  totalMinor: number; paidMinor: number; balanceMinor: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";
  statusId: string; statusLabel: string; statusColor: string; statusCompleted: boolean;
  customerId: string | null; customerName: string | null; customerPhone: string | null;
  itemCount: number; note: string | null;
  archivedAt: string | null;
  items: { name: string; quantity: number; note: string | null; attributes: Record<string, unknown> | null }[];
};

export function OrdersTable({ rows, statuses, methods, lineDefs = [], archived = false }: {
  rows: OrderRow[]; statuses: StatusOption[]; methods: { id: string; label: string }[];
  /** Attribute definitions, so "Bandana" can read "Bandana · Red · Cotton". */
  lineDefs?: FieldDef[];
  archived?: boolean;
}) {
  const describe = (row: OrderRow) =>
    row.items.map((item) => {
      const detail = formatLineAttributes(lineDefs, item.attributes);
      return `${item.name}${detail ? ` · ${detail}` : ""} × ${item.quantity}`;
    });
  const { money, date, t, can, orders: orderSettings } = useConfig();
  const router = useRouter();
  const toast = useToast();
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null);

  const editable = can("order:update");

  const columns: Column<OrderRow>[] = [
    {
      key: "number", header: `${t("order")} #`, width: "130px", mobilePrimary: true,
      value: (r) => r.number,
      cell: (r) => (
        <div>
          <span className="font-medium tabular">{r.number}</span>
          <span className="md:hidden ml-2 text-ink-muted">{r.customerName ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "customer", header: t("customer"), mobileHidden: true,
      value: (r) => r.customerName ?? "",
      cell: (r) => r.customerName
        ? <span className="truncate">{r.customerName}</span>
        : <span className="text-ink-subtle">Walk-in</span>,
    },
    { key: "orderDate", header: "Date", width: "120px", value: (r) => r.orderDate ?? "", cell: (r) => <span className="whitespace-nowrap">{date(r.orderDate)}</span> },
    {
      key: "items", header: t("product", "many"), value: (r) => describe(r).join(", "),
      cell: (r) => {
        const lines = describe(r);
        if (lines.length === 0) return <span className="text-ink-subtle">—</span>;
        return (
          <span className="block max-w-[280px]" title={lines.join(", ")}>
            <span className="block truncate">{lines[0]}</span>
            {lines.length > 1 ? (
              <span className="block truncate text-[12px] text-ink-subtle">
                + {lines.length - 1} more
              </span>
            ) : null}
          </span>
        );
      },
    },
    { key: "total", header: "Total", align: "right", width: "110px", value: (r) => r.totalMinor, cell: (r) => money(r.totalMinor) },
    { key: "advance", header: "Received", align: "right", width: "110px", defaultHidden: true, value: (r) => r.paidMinor, cell: (r) => money(r.paidMinor) },
    {
      key: "balance", header: "Balance", align: "right", width: "150px",
      value: (r) => r.balanceMinor,
      cell: (r) => (
        <BalanceBadge
          status={r.paymentStatus} balanceMinor={r.balanceMinor} size="sm"
          onClick={can("payment:create")
            ? () => setPayTarget({ orderId: r.id, orderNumber: r.number, customerId: r.customerId, customerName: r.customerName, totalMinor: r.totalMinor, paidMinor: r.paidMinor })
            : undefined}
        />
      ),
    },
    {
      key: "status", header: "Status", width: "160px",
      value: (r) => r.statusLabel,
      cell: (r) => (
        <StatusPicker
          current={{ id: r.statusId, label: r.statusLabel, color: r.statusColor, isCompleted: r.statusCompleted, isActive: true }}
          options={statuses}
          disabled={!editable}
          onChange={async (statusId) => {
            const result = await changeStatusAction(r.id, statusId);
            if (result.ok) { toast.push("Status updated"); router.refresh(); }
            else toast.push(result.error, "error");
          }}
        />
      ),
    },
    {
      key: "delivery", header: "Delivery by", width: "170px",
      value: (r) => r.deliveryByDate ?? "",
      cell: (r) => <DeliveryChip deliveryBy={r.deliveryByDate} isCompleted={r.statusCompleted} showDate={false} />,
    },
  ];

  const filters: FilterDef<OrderRow>[] = [
    {
      key: "status", label: "Status",
      options: statuses.map((s) => ({ value: s.id, label: s.label })),
      match: (r, v) => r.statusId === v,
    },
    {
      key: "payment", label: "Payment",
      options: [
        { value: "UNPAID", label: "Unpaid" }, { value: "PARTIAL", label: "Partially paid" },
        { value: "PAID", label: "Paid" }, { value: "OVERPAID", label: "Overpaid" },
        { value: "OUTSTANDING", label: "Any balance due" },
      ],
      match: (r, v) => (v === "OUTSTANDING" ? r.paymentStatus !== "PAID" : r.paymentStatus === v),
    },
    {
      key: "delivery", label: "Delivery",
      options: [
        { value: "overdue", label: "Overdue" }, { value: "today", label: "Due today" },
        { value: "soon", label: "Due soon" }, { value: "upcoming", label: "Upcoming" },
        { value: "done", label: "Completed" },
      ],
      match: (r, v) => deliveryState(r.deliveryByDate, r.statusCompleted, orderSettings.dueSoonDays).state === v,
    },
    {
      key: "customer", label: t("customer"),
      options: Array.from(new Map(rows.filter((r) => r.customerId).map((r) => [r.customerId!, r.customerName ?? ""])).entries())
        .map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
      match: (r, v) => r.customerId === v,
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        filters={filters}
        storageKey="orders"
        exportName="orders"
        searchable={(r) => [r.number, r.customerName, r.customerPhone, ...describe(r), r.note, r.statusLabel].filter(Boolean).join(" ")}
        onRowClick={(r) => router.push(`/orders/${r.id}`)}
        emptyIcon={ShoppingBag}
        emptyTitle={`No ${t("order", "many").toLowerCase()} yet`}
        emptyDescription={`Create your first ${t("order").toLowerCase()}, or import your spreadsheet to bring existing ones in.`}
        emptyAction={
          <>
            <a href="/orders/new" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white">New {t("order").toLowerCase()}</a>
            <a href="/import" className="inline-flex h-9 items-center rounded-lg bg-white px-3.5 text-[13px] font-medium ring-1 ring-line-strong">Import spreadsheet</a>
          </>
        }
        bulkActions={
          archived
            ? (can("order:archive")
                ? [{
                    label: "Restore",
                    icon: RotateCcw,
                    run: async (selected: OrderRow[]) => {
                      const result = await bulkArchiveOrdersAction(selected.map((r) => r.id), false);
                      if (result.ok) { toast.push(`${result.data.count} restored`); router.refresh(); }
                      else toast.push(result.error, "error");
                    },
                  }]
                : [])
            : [
                ...(editable
                  ? statuses.filter((s) => s.isActive).slice(0, 3).map((s) => ({
                      label: `Mark ${s.label}`,
                      icon: CheckCheck,
                      run: async (selected: OrderRow[]) => {
                        const result = await bulkChangeStatusAction(selected.map((r) => r.id), s.id);
                        if (result.ok) { toast.push(`${result.data.count} updated`); router.refresh(); }
                        else toast.push(result.error, "error");
                      },
                    }))
                  : []),
                ...(can("order:archive")
                  ? [{
                      label: "Archive",
                      icon: Archive,
                      run: async (selected: OrderRow[]) => {
                        const result = await bulkArchiveOrdersAction(selected.map((r) => r.id));
                        if (result.ok) { toast.push(`${result.data.count} archived`); router.refresh(); }
                        else toast.push(result.error, "error");
                      },
                    }]
                  : []),
                ...(can("order:delete")
                  ? [{
                      label: "Delete",
                      icon: Trash2,
                      danger: true,
                      run: async (selected: OrderRow[]) => {
                        const result = await bulkDeleteOrdersAction(selected.map((r) => r.id));
                        if (result.ok) { toast.push(`${result.data.deleted} deleted`); router.refresh(); }
                        else toast.push(result.error, "error");
                      },
                    }]
                  : []),
              ]
        }
      />
      <RecordPaymentSheet target={payTarget} methods={methods} onClose={() => setPayTarget(null)} onDone={() => router.refresh()} />
    </>
  );
}
