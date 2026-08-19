"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { MoneyInput } from "@/components/money-input";
import { Sheet } from "@/components/ui/sheet";
import { useConfig } from "@/components/config-provider";
import { useToast } from "@/components/ui/toast";
import { removeCustomerPriceAction, setCustomerPriceAction } from "@/server/actions/entities";

type PriceRow = {
  id: string; productId: string | null; productName: string | null;
  productDefaultMinor: number | null; priceMinor: number | null;
  discountPercent: number | null; note: string | null;
};

/**
 * Requirement 14 in one panel: a customer can have an agreed price for specific
 * products, or a blanket percentage rule across everything.
 */
export function CustomerPricing({ customerId, customerName, products, rows }: {
  customerId: string; customerName: string;
  products: { id: string; name: string; defaultPriceMinor: number }[];
  rows: PriceRow[];
}) {
  const { money, t, can } = useConfig();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [mode, setMode] = useState<"PRICE" | "DISCOUNT">("PRICE");
  const [priceMinor, setPriceMinor] = useState(0);
  const [discount, setDiscount] = useState("10");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = can("customer:price");

  async function save() {
    setError(null);
    setSaving(true);
    const result = await setCustomerPriceAction({
      customerId,
      productId: productId || null,
      priceMinor: mode === "PRICE" ? priceMinor : null,
      discountPercent: mode === "DISCOUNT" ? Number(discount) : null,
    });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    toast.push("Pricing rule saved");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Agreed pricing"
          description={`Prices that apply only to ${customerName}.`}
          action={editable ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus className="size-3.5" />Add</Button> : null}
        />
        <CardBody>
          {rows.length === 0 ? (
            <p className="text-[13px] text-ink-subtle">
              None yet — {t("order", "many").toLowerCase()} use the catalogue price. Add a rule to give this {t("customer").toLowerCase()} their own price.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.productName ?? `All ${t("product", "many").toLowerCase()}`}</p>
                    <p className="text-[12px] text-ink-subtle">
                      {r.priceMinor !== null
                        ? `${money(r.priceMinor)}${r.productDefaultMinor !== null ? ` · catalogue ${money(r.productDefaultMinor)}` : ""}`
                        : `${r.discountPercent}% off`}
                    </p>
                  </div>
                  {editable ? (
                    <Button variant="ghost" size="icon" aria-label="Remove rule"
                      onClick={async () => {
                        const result = await removeCustomerPriceAction(r.id, customerId);
                        if (result.ok) { toast.push("Rule removed"); router.refresh(); }
                        else toast.push(result.error, "error");
                      }}>
                      <Trash2 className="size-3.5 text-ink-subtle" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Sheet
        open={open} onClose={() => setOpen(false)} width="sm"
        title="Agreed price"
        description={`Applies to ${customerName} only.`}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={saving}>Save rule</Button></>}
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">{error}</p> : null}
          <Field label={t("product")} help={`Leave blank to apply to all ${t("product", "many").toLowerCase()}.`}>
            <Select value={productId} onChange={(e) => {
              setProductId(e.target.value);
              const p = products.find((x) => x.id === e.target.value);
              if (p) setPriceMinor(p.defaultPriceMinor);
            }}>
              <option value="">All {t("product", "many").toLowerCase()}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.defaultPriceMinor)}</option>)}
            </Select>
          </Field>

          <Field label="Rule type">
            <Select value={mode} onChange={(e) => setMode(e.target.value as "PRICE" | "DISCOUNT")}>
              <option value="PRICE">Fixed price</option>
              <option value="DISCOUNT">Percentage off</option>
            </Select>
          </Field>

          {mode === "PRICE" ? (
            <Field label="Their price"><MoneyInput valueMinor={priceMinor} onChange={setPriceMinor} /></Field>
          ) : (
            <Field label="Discount %"><Input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          )}

          <p className="rounded-lg bg-stone-100 px-3 py-2.5 text-[12.5px] text-ink-muted">
            This only affects new {t("order", "many").toLowerCase()}. Prices already recorded on past {t("order", "many").toLowerCase()} never change.
          </p>
        </div>
      </Sheet>
    </>
  );
}
