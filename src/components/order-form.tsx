"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardBody, CardHeader } from "./ui/card";
import { Field, Input, Select, Textarea } from "./ui/field";
import { Combobox } from "./combobox";
import { MoneyInput } from "./money-input";
import { CustomFields, type FieldDef } from "./custom-fields";
import { LineAttributeFields } from "./line-attributes";
import { useConfig } from "./config-provider";
import { useToast } from "./ui/toast";
import { computeOrderTotals } from "@/server/domain/pricing";
import { createCustomerAction } from "@/server/actions/entities";
import { createOrderAction, previewPricesAction, updateOrderAction } from "@/server/actions/orders";
import { toInputDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type PickerCustomer = { id: string; name: string; phone: string | null };
type PickerProduct = { id: string; name: string; defaultPriceMinor: number; unit: string };

type LineState = {
  key: string;
  productId: string | null;
  productName: string;
  quantity: string;
  unitPriceMinor: number | null;
  /** true once the user types a price — the pricing engine then stops overriding it. */
  overridden: boolean;
  discountMinor: number;
  note: string;
  attributes: Record<string, unknown>;
  explanation?: string;
};

export type OrderFormInitial = {
  id: string;
  customerId: string | null;
  orderDate: string;
  deliveryByDate: string | null;
  deliveryTime: string | null;
  statusId: string;
  note: string | null;
  internalNote: string | null;
  customerNote: string | null;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: number;
  additionalChargesMinor: number;
  items: {
    productId: string | null; productName: string; quantity: number;
    unitPriceMinor: number; discountMinor: number; note: string | null;
    attributes: Record<string, unknown> | null;
  }[];
  customFields: Record<string, unknown>;
};

const newLine = (): LineState => ({
  key: Math.random().toString(36).slice(2),
  productId: null, productName: "", quantity: "1", unitPriceMinor: null,
  overridden: false, discountMinor: 0, note: "", attributes: {},
});

export function OrderForm({ customers, products, statuses, methods, fieldDefs, lineFieldDefs, initial }: {
  customers: PickerCustomer[];
  products: PickerProduct[];
  statuses: { id: string; label: string; isActive: boolean; isDefault: boolean }[];
  methods: { id: string; label: string }[];
  fieldDefs: FieldDef[];
  /** Colour, material, country… configured in Settings → Custom fields. */
  lineFieldDefs: FieldDef[];
  initial?: OrderFormInitial;
}) {
  const { money, t, pricing, orders: orderSettings, currencySymbol } = useConfig();
  const router = useRouter();
  const toast = useToast();
  const [pendingPreview, startPreview] = useTransition();

  const [customerList, setCustomerList] = useState(customers);
  const [customerId, setCustomerId] = useState<string | null>(initial?.customerId ?? null);
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? toInputDate(new Date()));
  const [deliveryByDate, setDeliveryByDate] = useState(
    initial?.deliveryByDate ?? toInputDate(new Date(Date.now() + orderSettings.defaultDeliveryLeadDays * 86400000)),
  );
  const [deliveryTime, setDeliveryTime] = useState(initial?.deliveryTime ?? "");
  const [statusId, setStatusId] = useState(initial?.statusId ?? statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [internalNote, setInternalNote] = useState(initial?.internalNote ?? "");
  const [customerNote, setCustomerNote] = useState(initial?.customerNote ?? "");
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENT">(initial?.discountType ?? "AMOUNT");
  const [discountValue, setDiscountValue] = useState(String(initial?.discountValue ?? 0));
  const [additionalChargesMinor, setAdditionalChargesMinor] = useState(initial?.additionalChargesMinor ?? 0);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>(initial?.customFields ?? {});

  const [lines, setLines] = useState<LineState[]>(
    initial?.items.length
      ? initial.items.map((i) => ({
          key: Math.random().toString(36).slice(2),
          productId: i.productId, productName: i.productName, quantity: String(i.quantity),
          unitPriceMinor: i.unitPriceMinor, overridden: true,
          discountMinor: i.discountMinor, note: i.note ?? "",
          attributes: i.attributes ?? {},
        }))
      : [newLine()],
  );

  const [advanceMinor, setAdvanceMinor] = useState(0);
  const [advanceMethodId, setAdvanceMethodId] = useState(methods[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /**
   * Prices are resolved by the SAME engine the server will use on save.
   * The form never guesses a price itself.
   */
  useEffect(() => {
    const payload = lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity) || 1,
        unitPriceMinor: l.overridden ? l.unitPriceMinor : null,
      }));
    if (payload.length === 0) return;

    const timer = setTimeout(() => {
      startPreview(async () => {
        const result = await previewPricesAction(customerId, payload);
        if (!result.ok) return;
        setLines((prev) => {
          let cursor = 0;
          return prev.map((line) => {
            if (!line.productId) return line;
            const priced = result.data[cursor++];
            if (!priced || line.overridden) return line;
            return {
              ...line,
              unitPriceMinor: priced.unitPriceMinor,
              explanation: explain(priced.priceSource),
            };
          });
        });
      });
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, lines.map((l) => `${l.productId}:${l.quantity}:${l.overridden}`).join("|")]);

  /**
   * The live preview calls the SAME engine the server uses on save, so the
   * number in the summary panel and the number written to the database cannot
   * drift apart. Nothing here reimplements the arithmetic.
   */
  const totals = computeOrderTotals({
    lines: lines.map((l) => ({
      quantity: Number(l.quantity) || 0,
      unitPriceMinor: l.unitPriceMinor ?? 0,
      discountMinor: l.discountMinor,
    })),
    discountType,
    discountValue: pricing.enableDiscounts
      ? (discountType === "PERCENT" ? Number(discountValue || 0) : Math.round(Number(discountValue || 0) * 100))
      : 0,
    additionalChargesMinor: pricing.enableAdditionalCharges ? additionalChargesMinor : 0,
    taxEnabled: pricing.enableTax,
    taxRatePercent: pricing.taxRatePercent,
    taxInclusive: pricing.taxInclusive,
  });

  const lineTotals = totals.lineTotals;
  const subtotal = totals.subtotalMinor;
  const discount = totals.discountMinor;
  const tax = totals.taxMinor;
  const total = totals.totalMinor;
  const balance = total - (initial ? 0 : advanceMinor);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    const items = lines
      .filter((l) => l.productId || l.productName.trim())
      .map((l) => ({
        productId: l.productId,
        productName: l.productName || undefined,
        quantity: Number(l.quantity) || 0,
        unitPriceMinor: l.overridden ? l.unitPriceMinor ?? 0 : null,
        discountMinor: l.discountMinor,
        note: l.note || null,
        attributes: l.attributes,
      }));

    if (items.length === 0) { setError(`Add at least one ${t("product").toLowerCase()}.`); return; }
    if (items.some((i) => i.quantity <= 0)) { setError("Every line needs a quantity greater than zero."); return; }

    const payload = {
      customerId,
      orderDate: new Date(orderDate),
      deliveryByDate: deliveryByDate ? new Date(deliveryByDate) : null,
      deliveryTime: deliveryTime || null,
      statusId: statusId || null,
      note: note || null,
      internalNote: internalNote || null,
      customerNote: customerNote || null,
      discountType,
      discountValue: discountType === "PERCENT" ? Number(discountValue || 0) : Math.round(Number(discountValue || 0) * 100),
      additionalChargesMinor: totals.additionalChargesMinor,
      items,
      customFields: customValues,
      advance: !initial && advanceMinor > 0
        ? { amountMinor: advanceMinor, methodId: advanceMethodId || null, paidAt: new Date(orderDate) }
        : null,
    };

    setSaving(true);
    const result = initial ? await updateOrderAction(initial.id, payload) : await createOrderAction(payload);
    setSaving(false);

    if (!result.ok) { setError(result.error); return; }
    toast.push(initial ? `${t("order")} updated` : `${result.data.number} created`);
    router.push(`/orders/${result.data.id}`);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 pb-28 lg:pb-6">
      <div className="lg:col-span-2 space-y-4">
        {error ? (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
            <AlertCircle className="size-4 mt-px shrink-0" />{error}
          </p>
        ) : null}

        <Card>
          <CardHeader title={t("customer")} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t("customer")} required={orderSettings.requireCustomer} className="sm:col-span-2">
              <Combobox
                value={customerId} onChange={setCustomerId}
                placeholder={`Search ${t("customer", "many").toLowerCase()}…`}
                options={customerList.map((c) => ({ value: c.id, label: c.name, hint: c.phone ?? undefined }))}
                createLabel={`Create ${t("customer").toLowerCase()}`}
                onCreate={async (label) => {
                  const result = await createCustomerAction({ name: label });
                  if (!result.ok) { toast.push(result.error, "error"); return null; }
                  setCustomerList((prev) => [...prev, { id: result.data.id, name: result.data.name, phone: null }]);
                  toast.push(`${result.data.name} added`);
                  return result.data.id;
                }}
              />
            </Field>
            <Field label={`${t("order")} date`} required><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></Field>
            <Field label="Status">
              <Select value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                {statuses.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("product", "many")}
            description={pricing.enableCustomerSpecificPricing ? "Prices fill in from your pricing rules. You can always change them here." : undefined}
            action={<Button variant="secondary" size="sm" onClick={() => setLines((p) => [...p, newLine()])}><Plus className="size-3.5" />Add item</Button>}
          />
          <CardBody className="space-y-3">
            {lines.map((line, index) => (
              <div key={line.key} className="rounded-xl bg-stone-50 p-3 ring-1 ring-line">
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <Field label={index === 0 ? t("product") : undefined}>
                      <Combobox
                        value={line.productId}
                        onChange={(value) => {
                          const product = value ? productById.get(value) : null;
                          updateLine(line.key, {
                            productId: value,
                            productName: product?.name ?? "",
                            unitPriceMinor: product ? product.defaultPriceMinor : null,
                            overridden: false,
                            explanation: undefined,
                          });
                        }}
                        placeholder={`Choose a ${t("product").toLowerCase()}…`}
                        options={products.map((p) => ({ value: p.id, label: p.name, hint: money(p.defaultPriceMinor) }))}
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label={index === 0 ? "Qty" : undefined}>
                      <Input type="number" min="0" step="any" inputMode="decimal" className="tabular"
                        value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} />
                    </Field>
                  </div>
                  <div className="sm:col-span-3">
                    <Field label={index === 0 ? "Unit price" : undefined}>
                      <MoneyInput
                        valueMinor={line.unitPriceMinor ?? 0}
                        onChange={(minor) => updateLine(line.key, { unitPriceMinor: minor, overridden: true, explanation: "Price set on this order" })}
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2 flex items-end justify-between gap-2">
                    <div className="flex-1">
                      {index === 0 ? <p className="mb-1.5 text-[13px] font-medium text-ink-muted">Total</p> : null}
                      <p className="h-10 flex items-center justify-end text-sm font-medium tabular">{money(lineTotals[index])}</p>
                    </div>
                    {lines.length > 1 ? (
                      <Button variant="ghost" size="icon" aria-label="Remove line"
                        onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}>
                        <Trash2 className="size-4 text-ink-subtle" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                {lineFieldDefs.length > 0 ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <LineAttributeFields
                      defs={lineFieldDefs}
                      values={line.attributes}
                      onChange={(key, value) => updateLine(line.key, { attributes: { ...line.attributes, [key]: value } })}
                    />
                  </div>
                ) : null}

                <div className="mt-2">
                  <Input
                    value={line.note}
                    onChange={(e) => updateLine(line.key, { note: e.target.value })}
                    placeholder="Note for this line (optional)"
                    className="h-8 text-[12.5px]"
                  />
                </div>

                {line.explanation ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-subtle">
                    <Info className="size-3" />{line.explanation}
                    {pendingPreview ? <span className="opacity-60">· updating…</span> : null}
                  </p>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Delivery & notes" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Delivery by" required={orderSettings.requireDeliveryDate}>
              <Input type="date" value={deliveryByDate} onChange={(e) => setDeliveryByDate(e.target.value)} />
            </Field>
            <Field label="Delivery time" help="Optional.">
              <Input type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} />
            </Field>
            <Field label={`${t("order")} note`} className="sm:col-span-2">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Anything about this ${t("order").toLowerCase()}`} />
            </Field>
            <Field label="Internal note" help="Only your team sees this.">
              <Textarea rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
            </Field>
            <Field label={`Note for the ${t("customer").toLowerCase()}`}>
              <Textarea rows={2} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        {fieldDefs.length > 0 ? (
          <Card>
            <CardHeader title="More details" />
            <CardBody>
              <CustomFields defs={fieldDefs} values={customValues}
                onChange={(key, value) => setCustomValues((prev) => ({ ...prev, [key]: value }))} />
            </CardBody>
          </Card>
        ) : null}
      </div>

      {/* summary */}
      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-20 space-y-4">
          <Card>
            <CardHeader title="Summary" />
            <CardBody className="space-y-3">
              <Row label="Subtotal" value={money(subtotal)} />

              {pricing.enableDiscounts ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[13px] text-ink-muted">Discount</span>
                  <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "AMOUNT" | "PERCENT")}
                    className="h-9 w-[70px] text-[13px]">
                    <option value="AMOUNT">{currencySymbol}</option>
                    <option value="PERCENT">%</option>
                  </Select>
                  <Input type="number" min="0" step="any" value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)} className="h-9 w-24 text-right tabular" />
                </div>
              ) : null}

              {pricing.enableAdditionalCharges ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[13px] text-ink-muted">Extra charges</span>
                  <div className="w-32"><MoneyInput valueMinor={additionalChargesMinor} onChange={setAdditionalChargesMinor} /></div>
                </div>
              ) : null}

              {discount > 0 ? <Row label="Discount applied" value={`− ${money(discount)}`} muted /> : null}
              {pricing.enableTax && tax > 0 ? <Row label={`Tax (${pricing.taxRatePercent}%)`} value={money(tax)} muted /> : null}

              <div className="h-px bg-line" />
              <Row label="Total" value={money(total)} strong />

              {!initial ? (
                <>
                  <div className="h-px bg-line" />
                  <Field label="Advance received" help="Recorded as a real payment, not just a number.">
                    <MoneyInput valueMinor={advanceMinor} onChange={setAdvanceMinor} />
                  </Field>
                  {advanceMinor > 0 ? (
                    <Field label="Paid by">
                      <Select value={advanceMethodId} onChange={(e) => setAdvanceMethodId(e.target.value)}>
                        <option value="">Not specified</option>
                        {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </Select>
                    </Field>
                  ) : null}
                  <Row label="Balance due" value={money(Math.max(balance, 0))}
                    strong className={cn(balance <= 0 ? "text-emerald-700" : "text-red-700")} />
                </>
              ) : null}
            </CardBody>
          </Card>

          <div className="hidden lg:flex gap-2">
            <Button className="flex-1" size="lg" onClick={submit} loading={saving}>
              {initial ? "Save changes" : `Create ${t("order").toLowerCase()}`}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => router.back()}>Cancel</Button>
          </div>
        </div>
      </div>

      {/* mobile sticky bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-white/95 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between text-[13px] mb-2">
          <span className="text-ink-muted">Total</span>
          <span className="font-semibold tabular">{money(total)}</span>
          {!initial ? (
            <>
              <span className="text-ink-muted">Balance</span>
              <span className={cn("font-semibold tabular", balance <= 0 ? "text-emerald-700" : "text-red-700")}>{money(Math.max(balance, 0))}</span>
            </>
          ) : null}
        </div>
        <Button className="w-full" size="lg" onClick={submit} loading={saving}>
          {initial ? "Save changes" : `Create ${t("order").toLowerCase()}`}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, strong, muted, className }: {
  label: string; value: string; strong?: boolean; muted?: boolean; className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cn("text-[13px]", muted ? "text-ink-subtle" : "text-ink-muted")}>{label}</span>
      <span className={cn("tabular", strong ? "text-[17px] font-semibold" : "text-[14px]", className)}>{value}</span>
    </div>
  );
}

function explain(source: string) {
  switch (source) {
    case "ORDER_OVERRIDE": return "Price set on this order";
    case "CUSTOMER_PRODUCT": return "Agreed price for this customer";
    case "CUSTOMER_RULE": return "Customer pricing rule applied";
    case "PRODUCT_DEFAULT": return "Catalogue price";
    default: return "Manual line";
  }
}
