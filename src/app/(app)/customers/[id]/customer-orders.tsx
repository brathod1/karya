"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BalanceBadge } from "@/components/balance-badge";
import { StatusChip } from "@/components/status-chip";
import { DeliveryChip } from "@/components/delivery-chip";
import { RecordPaymentSheet, type PaymentTarget } from "@/components/record-payment-sheet";
import { useConfig } from "@/components/config-provider";

type Row = {
  id: string; number: string; orderDate: string | null; deliveryByDate: string | null;
  totalMinor: number; paidMinor: number; balanceMinor: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";
  statusLabel: string; statusColor: string; statusCompleted: boolean;
};

export function CustomerOrders({ rows, customerId, customerName, methods }: {
  rows: Row[]; customerId: string; customerName: string; methods: { id: string; label: string }[];
}) {
  const { money, date, can, t } = useConfig();
  const router = useRouter();
  const [target, setTarget] = useState<PaymentTarget | null>(null);

  if (rows.length === 0) {
    return <p className="px-5 pb-5 text-[13px] text-ink-subtle">No {t("order", "many").toLowerCase()} yet.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-line border-t border-line">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-stone-50">
            <Link href={`/orders/${r.id}`} className="min-w-[140px] flex-1">
              <p className="font-medium tabular text-[13.5px]">{r.number}</p>
              <p className="text-[12px] text-ink-subtle">{date(r.orderDate)}</p>
            </Link>
            <StatusChip status={{ label: r.statusLabel, color: r.statusColor }} />
            <DeliveryChip deliveryBy={r.deliveryByDate} isCompleted={r.statusCompleted} showDate={false} />
            <span className="tabular text-[13.5px] font-medium w-24 text-right">{money(r.totalMinor)}</span>
            <BalanceBadge
              status={r.paymentStatus} balanceMinor={r.balanceMinor} size="sm"
              onClick={can("payment:create")
                ? () => setTarget({ orderId: r.id, orderNumber: r.number, customerId, customerName, totalMinor: r.totalMinor, paidMinor: r.paidMinor })
                : undefined}
            />
          </li>
        ))}
      </ul>
      <RecordPaymentSheet target={target} methods={methods} onClose={() => setTarget(null)} onDone={() => router.refresh()} />
    </>
  );
}
