"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, MoreHorizontal, Printer, RotateCcw, Trash2, Wallet } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BalanceBadge } from "@/components/balance-badge";
import { DeliveryChip } from "@/components/delivery-chip";
import { StatusPicker, type StatusOption } from "@/components/status-chip";
import { RecordPaymentSheet, type PaymentTarget } from "@/components/record-payment-sheet";
import { ConfirmDialog } from "@/components/ui/sheet";
import { useConfig } from "@/components/config-provider";
import { useToast } from "@/components/ui/toast";
import {
  archiveOrderAction, changeStatusAction, deleteOrderAction, restoreOrderAction, voidPaymentAction,
} from "@/server/actions/orders";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

type Item = {
  id: string; name: string; quantity: number; unitPriceMinor: number;
  lineTotalMinor: number; priceSource: string; note: string | null;
  detail: string;
};

type PaymentRow = {
  id: string; amountMinor: number; paidAt: string | null; methodLabel: string | null;
  reference: string | null; note: string | null; kind: string; voidedAt: string | null;
};

export function OrderDetailClient({ order, items, payments, statuses, methods }: {
  order: {
    id: string; number: string; totalMinor: number; paidMinor: number;
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID"; statusId: string;
    orderDate: string | null; deliveryByDate: string | null; deliveryTime: string | null;
    subtotalMinor: number; discountMinor: number; additionalChargesMinor: number; taxMinor: number;
    note: string | null; internalNote: string | null; customerNote: string | null;
    customerId: string | null; customerName: string | null; statusCompleted: boolean;
    archivedAt: string | null;
  };
  items: Item[];
  payments: PaymentRow[];
  statuses: StatusOption[];
  methods: { id: string; label: string }[];
}) {
  const { money, date, t, can } = useConfig();
  const router = useRouter();
  const toast = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<PaymentRow | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);

  const balance = order.totalMinor - order.paidMinor;
  const current = statuses.find((s) => s.id === order.statusId) ?? null;

  const target: PaymentTarget = {
    orderId: order.id, orderNumber: order.number,
    customerId: order.customerId, customerName: order.customerName,
    totalMinor: order.totalMinor, paidMinor: order.paidMinor,
  };

  return (
    <>
      <Card>
        <CardBody className="pt-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="text-[11.5px] uppercase tracking-wide text-ink-subtle">Total</p>
              <p className="mt-0.5 text-[26px] font-semibold tabular leading-none">{money(order.totalMinor)}</p>
            </div>
            <div>
              <p className="text-[11.5px] uppercase tracking-wide text-ink-subtle">Balance</p>
              <div className="mt-1">
                <BalanceBadge status={order.paymentStatus} balanceMinor={balance}
                  onClick={can("payment:create") ? () => setPayOpen(true) : undefined} />
              </div>
            </div>
            <div>
              <p className="text-[11.5px] uppercase tracking-wide text-ink-subtle">Status</p>
              <div className="mt-1">
                <StatusPicker current={current} options={statuses} disabled={!can("order:update")}
                  onChange={async (statusId) => {
                    const result = await changeStatusAction(order.id, statusId);
                    if (result.ok) { toast.push("Status updated"); router.refresh(); }
                    else toast.push(result.error, "error");
                  }} />
              </div>
            </div>
            <div>
              <p className="text-[11.5px] uppercase tracking-wide text-ink-subtle">Delivery</p>
              <div className="mt-1"><DeliveryChip deliveryBy={order.deliveryByDate} isCompleted={order.statusCompleted} /></div>
            </div>
            <div className="ml-auto flex gap-2">
              {can("payment:create") && order.paymentStatus !== "PAID" ? (
                <Button size="sm" onClick={() => setPayOpen(true)}><Wallet className="size-3.5" />Record payment</Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="size-3.5" />Print</Button>

              {can("order:archive") ? (
                <div className="relative">
                  <Button size="sm" variant="secondary" aria-label="More actions" onClick={() => setMenuOpen((v) => !v)}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                  {menuOpen ? (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg bg-white p-1 shadow-lg ring-1 ring-line animate-in">
                        {order.archivedAt ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setMenuOpen(false);
                              const result = await restoreOrderAction(order.id);
                              if (result.ok) { toast.push("Restored"); router.refresh(); }
                              else toast.push(result.error, "error");
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-stone-100"
                          >
                            <RotateCcw className="size-3.5" />Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setMenuOpen(false); setArchiveOpen(true); }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-stone-100"
                          >
                            <Ban className="size-3.5" />Archive
                          </button>
                        )}

                        {can("order:delete") ? (
                          <button
                            type="button"
                            onClick={() => { setMenuOpen(false); setConfirmation(""); setDeleteOpen(true); }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="size-3.5" />Delete permanently
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ink-muted">
            <span>Ordered {date(order.orderDate)}</span>
            {order.deliveryTime ? <span>Delivery time {order.deliveryTime}</span> : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("product", "many")} description={`${items.length} ${items.length === 1 ? "line" : "lines"}`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line bg-stone-50 text-[12px] uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Unit price</th>
                <th className="px-5 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5">
                    <p className="font-medium">{item.name}</p>
                    {item.detail ? <p className="text-[12.5px] text-ink-muted">{item.detail}</p> : null}
                    {item.note ? <p className="text-[12px] text-ink-subtle">{item.note}</p> : null}
                    <p className="text-[11.5px] text-ink-subtle">{explain(item.priceSource)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{item.quantity}</td>
                  <td className="px-3 py-2.5 text-right tabular">{money(item.unitPriceMinor)}</td>
                  <td className="px-5 py-2.5 text-right tabular font-medium">{money(item.lineTotalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="pt-4">
          <div className="ml-auto max-w-xs space-y-1.5">
            <Row label="Subtotal" value={money(order.subtotalMinor)} />
            {order.discountMinor > 0 ? <Row label="Discount" value={`− ${money(order.discountMinor)}`} /> : null}
            {order.additionalChargesMinor > 0 ? <Row label="Additional charges" value={money(order.additionalChargesMinor)} /> : null}
            {order.taxMinor > 0 ? <Row label="Tax" value={money(order.taxMinor)} /> : null}
            <div className="h-px bg-line my-1" />
            <Row label="Total" value={money(order.totalMinor)} strong />
            <Row label="Received" value={money(order.paidMinor)} />
            <Row label="Balance due" value={money(Math.max(balance, 0))} strong
              className={balance <= 0 ? "text-emerald-700" : "text-red-700"} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Payment history"
          description="Balance is calculated from these records — it is never typed in."
          action={can("payment:create") ? <Button size="sm" variant="secondary" onClick={() => setPayOpen(true)}>Add payment</Button> : null}
        />
        <CardBody>
          {payments.length === 0 ? (
            <p className="text-[13px] text-ink-subtle">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {payments.map((p) => (
                <li key={p.id} className={cn("flex items-center gap-3 py-2.5", p.voidedAt && "opacity-50")}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className={cn("font-medium tabular", p.kind === "REFUND" && "text-red-700")}>
                        {p.kind === "REFUND" ? "− " : ""}{money(Math.abs(p.amountMinor))}
                      </span>
                      {p.methodLabel ? <span className="text-ink-muted"> · {p.methodLabel}</span> : null}
                      {p.voidedAt ? <span className="text-red-700"> · voided</span> : null}
                    </p>
                    <p className="text-[12px] text-ink-subtle">
                      {date(p.paidAt)}{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  {can("payment:void") && !p.voidedAt ? (
                    <Button variant="ghost" size="sm" onClick={() => setVoidTarget(p)}>
                      <Ban className="size-3.5" />Void
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {(order.note || order.internalNote || order.customerNote) ? (
        <Card>
          <CardHeader title="Notes" />
          <CardBody className="space-y-3 text-[13px]">
            {order.note ? <NoteBlock label={`${t("order")} note`} value={order.note} /> : null}
            {order.internalNote ? <NoteBlock label="Internal note" value={order.internalNote} /> : null}
            {order.customerNote ? <NoteBlock label={`Note for the ${t("customer").toLowerCase()}`} value={order.customerNote} /> : null}
          </CardBody>
        </Card>
      ) : null}

      {order.archivedAt ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">
          This {t("order").toLowerCase()} is archived. It is hidden from lists and excluded from every total,
          but nothing has been lost — restore it from the menu above.
        </div>
      ) : null}

      <ConfirmDialog
        open={archiveOpen} onClose={() => setArchiveOpen(false)} loading={working}
        title={`Archive ${order.number}?`}
        message="It disappears from your lists and stops counting towards sales and balances. The record, its payments and its history all stay, and you can restore it at any time."
        confirmLabel="Archive"
        onConfirm={async () => {
          setWorking(true);
          const result = await archiveOrderAction(order.id);
          setWorking(false);
          setArchiveOpen(false);
          if (result.ok) { toast.push("Archived"); router.push("/orders"); router.refresh(); }
          else toast.push(result.error, "error");
        }}
      />

      <Sheet
        open={deleteOpen} onClose={() => setDeleteOpen(false)} width="sm"
        title="Delete permanently"
        description={`${order.number} — this cannot be undone`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="danger" loading={working}
              disabled={confirmation.trim().toLowerCase() !== order.number.toLowerCase()}
              onClick={async () => {
                setWorking(true);
                const result = await deleteOrderAction(order.id, confirmation);
                setWorking(false);
                if (!result.ok) { toast.push(result.error, "error"); return; }
                setDeleteOpen(false);
                toast.push(`${result.data.number} deleted`);
                router.push("/orders");
                router.refresh();
              }}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
            This removes the {t("order").toLowerCase()}, its items, its payments and its files for good.
            If money changed hands, archive it instead — deleted records cannot be produced later
            when someone asks what happened.
          </p>
          <p className="text-[13px] text-ink-muted">
            A record of the deletion, including what was in it, stays in the audit log.
          </p>
          <Field label={`Type ${order.number} to confirm`}>
            <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
              placeholder={order.number} autoFocus autoComplete="off" />
          </Field>
        </div>
      </Sheet>

      {payOpen ? (
        <RecordPaymentSheet target={target} methods={methods} onClose={() => setPayOpen(false)} onDone={() => router.refresh()} />
      ) : null}

      <ConfirmDialog
        open={!!voidTarget} onClose={() => setVoidTarget(null)} danger loading={voiding}
        title="Void this payment?"
        message="The payment stays in the history marked as voided, and the balance is recalculated. Nothing is deleted."
        confirmLabel="Void payment"
        onConfirm={async () => {
          if (!voidTarget) return;
          setVoiding(true);
          const result = await voidPaymentAction(voidTarget.id, "Voided by user");
          setVoiding(false);
          setVoidTarget(null);
          if (result.ok) { toast.push("Payment voided"); router.refresh(); }
          else toast.push(result.error, "error");
        }}
      />
    </>
  );
}

function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className={cn("tabular", strong ? "text-[15px] font-semibold" : "text-[13.5px]", className)}>{value}</span>
    </div>
  );
}

function NoteBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function explain(source: string) {
  switch (source) {
    case "ORDER_OVERRIDE": return "Price set on this order";
    case "CUSTOMER_PRODUCT": return "Agreed price for this customer";
    case "CUSTOMER_RULE": return "Customer pricing rule";
    case "PRODUCT_DEFAULT": return "Catalogue price at the time of the order";
    default: return "Manual line";
  }
}
