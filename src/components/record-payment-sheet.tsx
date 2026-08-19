"use client";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { applyCreditAction, customerCreditAction, recordPaymentAction } from "@/server/actions/orders";
import { Button } from "./ui/button";
import { Field, Input, Select, Textarea } from "./ui/field";
import { MoneyInput } from "./money-input";
import { Sheet } from "./ui/sheet";
import { useToast } from "./ui/toast";
import { useConfig } from "./config-provider";
import { toInputDate } from "@/lib/format";

export type PaymentTarget = {
  orderId: string;
  orderNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  totalMinor: number;
  paidMinor: number;
};

/**
 * One component, reachable from every balance badge in the product:
 * orders table, order page, customer page, dashboard, payments page.
 */
export function RecordPaymentSheet({ target, methods, onClose, onDone }: {
  target: PaymentTarget | null;
  methods: { id: string; label: string }[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const { money, t } = useConfig();
  const toast = useToast();
  const outstanding = target ? target.totalMinor - target.paidMinor : 0;

  const [amountMinor, setAmountMinor] = useState(0);
  const [methodId, setMethodId] = useState<string>(methods[0]?.id ?? "");
  const [paidAt, setPaidAt] = useState(toInputDate(new Date()));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditMinor, setCreditMinor] = useState(0);

  useEffect(() => {
    if (!target) return;
    setAmountMinor(Math.max(outstanding, 0));
    setError(null);
    setReference("");
    setNote("");
    setPaidAt(toInputDate(new Date()));
    setCreditMinor(0);

    if (target.customerId) {
      let cancelled = false;
      customerCreditAction(target.customerId).then((result) => {
        if (!cancelled && result.ok) setCreditMinor(result.data.creditMinor);
      });
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.orderId]);

  if (!target) return null;

  const willOverpay = amountMinor > outstanding && outstanding >= 0;

  async function submit() {
    if (!target) return;
    setPending(true);
    setError(null);
    const result = await recordPaymentAction({
      orderId: target.orderId,
      amountMinor,
      methodId: methodId || null,
      paidAt: new Date(paidAt),
      reference: reference || null,
      note: note || null,
    });
    setPending(false);

    if (!result.ok) { setError(result.error); return; }

    const { flag, excessMinor, creditMinor: kept, balanceMinor } = result.data;
    toast.push(
      flag === "OVERPAID"
        ? `Payment recorded. This ${t("order").toLowerCase()} is now overpaid by ${money(excessMinor)} and has been flagged.`
        : flag === "CREDIT"
          ? `Payment recorded. ${money(kept)} kept as credit for ${target.customerName ?? "this customer"}.`
          : `Payment recorded. Balance is now ${money(Math.max(balanceMinor, 0))}.`,
      flag === "NONE" ? "success" : "info",
    );
    onDone?.();
    onClose();
  }

  return (
    <Sheet
      open onClose={onClose}
      title="Record payment"
      description={`${target.orderNumber}${target.customerName ? ` · ${target.customerName}` : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={amountMinor <= 0}>Record payment</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-3 ring-1 ring-line">
          <Stat label={`${t("order")} total`} value={money(target.totalMinor)} />
          <Stat label="Received" value={money(target.paidMinor)} />
          <Stat label="Outstanding" value={money(Math.max(outstanding, 0))} strong />
        </div>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
            <AlertTriangle className="size-4 mt-px shrink-0" />{error}
          </p>
        ) : null}

        <Field label="Amount" required>
          <MoneyInput valueMinor={amountMinor} onChange={setAmountMinor} autoFocus />
        </Field>

        {willOverpay ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
            This is {money(amountMinor - outstanding)} more than the outstanding balance. Depending on your settings the
            order will be flagged as overpaid, kept as customer credit, or rejected.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Method">
            <Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">Not specified</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>

        <Field label="Reference" help="UPI reference, cheque number, anything you want to find later.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAmountMinor(Math.max(outstanding, 0))}>Full balance</Button>
          <Button variant="secondary" size="sm" onClick={() => setAmountMinor(Math.round(Math.max(outstanding, 0) / 2))}>Half</Button>
        </div>

        {creditMinor > 0 && outstanding > 0 ? (
          <div className="rounded-lg bg-teal-50 px-3 py-2.5 ring-1 ring-teal-200">
            <p className="text-[13px] text-teal-900">
              {target.customerName ?? "This customer"} has <span className="font-semibold tabular">{money(creditMinor)}</span> in credit.
            </p>
            <Button
              size="sm" variant="secondary" className="mt-2" loading={pending}
              onClick={async () => {
                setPending(true);
                const result = await applyCreditAction(target.orderId, Math.min(creditMinor, outstanding));
                setPending(false);
                if (!result.ok) { setError(result.error); return; }
                toast.push(`${money(result.data.appliedMinor)} paid from credit.`);
                onDone?.();
                onClose();
              }}
            >
              Use {money(Math.min(creditMinor, outstanding))} of it
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={`mt-0.5 tabular ${strong ? "text-[15px] font-semibold" : "text-[14px]"}`}>{value}</p>
    </div>
  );
}
