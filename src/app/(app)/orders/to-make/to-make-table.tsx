"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusChip } from "@/components/status-chip";
import { DeliveryChip } from "@/components/delivery-chip";
import { useConfig } from "@/components/config-provider";
import { cn } from "@/lib/cn";

export type MakeRow = {
  id: string;
  name: string;
  /** "Red · Cotton" — empty when the product has no attributes configured. */
  detail: string;
  quantity: number;
  dueBy: string | null;
  orders: {
    id: string; number: string; quantity: number;
    customerName: string | null; deliveryByDate: string | null;
    statusLabel: string; statusColor: string;
  }[];
};

export function ToMakeTable({ rows }: { rows: MakeRow[] }) {
  const { t } = useConfig();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const open = expanded === row.id;
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : row.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50 sm:px-5"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-teal-50 text-[15px] font-semibold tabular text-teal-800 ring-1 ring-teal-200">
                {row.quantity}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.name}</span>
                {row.detail ? (
                  <span className="block truncate text-[12.5px] text-ink-muted">{row.detail}</span>
                ) : null}
                <span className="block text-[12px] text-ink-subtle">
                  {row.orders.length} {row.orders.length === 1 ? t("order").toLowerCase() : t("order", "many").toLowerCase()}
                </span>
              </span>

              <span className="shrink-0">
                <DeliveryChip deliveryBy={row.dueBy} isCompleted={false} showDate={false} />
              </span>

              {open
                ? <ChevronDown className="size-4 shrink-0 text-ink-subtle" />
                : <ChevronRight className="size-4 shrink-0 text-ink-subtle" />}
            </button>

            {open ? (
              <ul className={cn("bg-stone-50/60 px-4 pb-3 sm:px-5")}>
                {row.orders.map((order) => (
                  <li key={`${order.id}-${order.number}`} className="flex flex-wrap items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                    <span className="w-10 shrink-0 text-right tabular text-[13px] font-medium">{order.quantity}</span>
                    <Link href={`/orders/${order.id}`} className="tabular text-[13px] font-medium hover:underline">
                      {order.number}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
                      {order.customerName ?? "Walk-in"}
                    </span>
                    <StatusChip status={{ label: order.statusLabel, color: order.statusColor }} />
                    <DeliveryChip deliveryBy={order.deliveryByDate} isCompleted={false} showDate={false} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
