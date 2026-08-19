"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { updateBusinessProfileAction, updateSettingsAction } from "@/server/actions/settings";

type Initial = {
  name: string; logoUrl: string | null; currencyCode: string; currencySymbol: string;
  timezone: string; locale: string; dateFormat: string; numberLocale: string;
  currencyPosition: "before" | "after";
  enableCostTracking: boolean; enableTax: boolean; taxRatePercent: number;
  enableDiscounts: boolean; enableAdditionalCharges: boolean; enableCustomerSpecificPricing: boolean;
  overpaymentPolicy: "REJECT" | "CREDIT" | "FLAG";
  autoAdvanceStatusOnFullPayment: boolean;
  requireCustomer: boolean; requireDeliveryDate: boolean;
  defaultDeliveryLeadDays: number; dueSoonDays: number; allowOverproduction: boolean;
};

const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
const DATE_FORMATS = [
  { value: "dd MMM yyyy", label: "18 Aug 2026" },
  { value: "dd/MM/yyyy", label: "18/08/2026" },
  { value: "MM/dd/yyyy", label: "08/18/2026" },
  { value: "yyyy-MM-dd", label: "2026-08-18" },
];

export function BusinessForm({ initial, canManage }: { initial: Initial; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const profile = await updateBusinessProfileAction({
      name: v.name, logoUrl: v.logoUrl || null, currencyCode: v.currencyCode,
      currencySymbol: v.currencySymbol, timezone: v.timezone, locale: v.locale,
    });
    const settings = await updateSettingsAction({
      formats: { dateFormat: v.dateFormat, numberLocale: v.numberLocale, currencyPosition: v.currencyPosition },
      pricing: {
        enableCostTracking: v.enableCostTracking, enableTax: v.enableTax, taxRatePercent: Number(v.taxRatePercent),
        enableDiscounts: v.enableDiscounts, enableAdditionalCharges: v.enableAdditionalCharges,
        enableCustomerSpecificPricing: v.enableCustomerSpecificPricing,
      },
      payments: { overpaymentPolicy: v.overpaymentPolicy, autoAdvanceStatusOnFullPayment: v.autoAdvanceStatusOnFullPayment },
      orders: {
        requireCustomer: v.requireCustomer, requireDeliveryDate: v.requireDeliveryDate,
        defaultDeliveryLeadDays: Number(v.defaultDeliveryLeadDays), dueSoonDays: Number(v.dueSoonDays),
      },
      events: { allowOverproduction: v.allowOverproduction },
    });
    setSaving(false);
    if (!profile.ok) return toast.push(profile.error, "error");
    if (!settings.ok) return toast.push(settings.error, "error");
    toast.push("Settings saved");
    router.refresh();
  }

  const disabled = !canManage;

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader title="Business profile" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" className="sm:col-span-2">
            <Input value={v.name} disabled={disabled} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Logo URL" className="sm:col-span-2" help="Paste a link to your logo image.">
            <Input value={v.logoUrl ?? ""} disabled={disabled} onChange={(e) => setV({ ...v, logoUrl: e.target.value })} placeholder="https://" />
          </Field>
          <Field label="Currency code"><Input value={v.currencyCode} disabled={disabled} maxLength={3} onChange={(e) => setV({ ...v, currencyCode: e.target.value.toUpperCase() })} /></Field>
          <Field label="Currency symbol"><Input value={v.currencySymbol} disabled={disabled} maxLength={4} onChange={(e) => setV({ ...v, currencySymbol: e.target.value })} /></Field>
          <Field label="Symbol position">
            <Select value={v.currencyPosition} disabled={disabled} onChange={(e) => setV({ ...v, currencyPosition: e.target.value as "before" | "after" })}>
              <option value="before">Before — {v.currencySymbol}1,250</option>
              <option value="after">After — 1,250{v.currencySymbol}</option>
            </Select>
          </Field>
          <Field label="Timezone">
            <Select value={v.timezone} disabled={disabled} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </Select>
          </Field>
          <Field label="Date format">
            <Select value={v.dateFormat} disabled={disabled} onChange={(e) => setV({ ...v, dateFormat: e.target.value })}>
              {DATE_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Number format" help="Controls digit grouping.">
            <Select value={v.numberLocale} disabled={disabled} onChange={(e) => setV({ ...v, numberLocale: e.target.value })}>
              <option value="en-IN">Indian — 1,25,000</option>
              <option value="en-US">Western — 125,000</option>
              <option value="de-DE">European — 125.000</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pricing" description="Turn off anything your business doesn't use — the fields disappear from forms." />
        <CardBody className="space-y-3">
          <Toggle label="Customer-specific pricing" description="Let the same product have a different price for different customers."
            checked={v.enableCustomerSpecificPricing} disabled={disabled} onChange={(x) => setV({ ...v, enableCustomerSpecificPricing: x })} />
          <Toggle label="Discounts" description="Show a discount field on orders."
            checked={v.enableDiscounts} disabled={disabled} onChange={(x) => setV({ ...v, enableDiscounts: x })} />
          <Toggle label="Additional charges" description="Delivery, packing, or any extra line on the order total."
            checked={v.enableAdditionalCharges} disabled={disabled} onChange={(x) => setV({ ...v, enableAdditionalCharges: x })} />
          <Toggle label="Cost tracking" description="Record what each product costs you, and see estimated profit. Entirely optional."
            checked={v.enableCostTracking} disabled={disabled} onChange={(x) => setV({ ...v, enableCostTracking: x })} />
          <Toggle label="Tax" description="Add a tax line to order totals."
            checked={v.enableTax} disabled={disabled} onChange={(x) => setV({ ...v, enableTax: x })} />
          {v.enableTax ? (
            <Field label="Tax rate %" className="max-w-[160px]">
              <Input type="number" min="0" max="100" step="0.01" value={v.taxRatePercent} disabled={disabled}
                onChange={(e) => setV({ ...v, taxRatePercent: Number(e.target.value) })} />
            </Field>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Payments" />
        <CardBody className="space-y-3">
          <Field label="If someone pays more than they owe"
            help="Refusing money the owner has already received is usually worse than flagging it, so flagging is the default.">
            <Select value={v.overpaymentPolicy} disabled={disabled}
              onChange={(e) => setV({ ...v, overpaymentPolicy: e.target.value as Initial["overpaymentPolicy"] })}>
              <option value="FLAG">Accept it and flag the order as overpaid</option>
              <option value="CREDIT">Accept it and keep the extra as customer credit</option>
              <option value="REJECT">Reject the payment</option>
            </Select>
          </Field>
          <Toggle label="Auto-complete on full payment"
            description="When an order is fully paid, move it to your first completed status automatically."
            checked={v.autoAdvanceStatusOnFullPayment} disabled={disabled}
            onChange={(x) => setV({ ...v, autoAdvanceStatusOnFullPayment: x })} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Orders & production" />
        <CardBody className="space-y-3">
          <Toggle label="Require a customer on every order" checked={v.requireCustomer} disabled={disabled}
            onChange={(x) => setV({ ...v, requireCustomer: x })} />
          <Toggle label="Require a delivery date" checked={v.requireDeliveryDate} disabled={disabled}
            onChange={(x) => setV({ ...v, requireDeliveryDate: x })} />
          <Toggle label="Allow making more than planned"
            description="Off by default, so a typo can't quietly inflate your production numbers."
            checked={v.allowOverproduction} disabled={disabled} onChange={(x) => setV({ ...v, allowOverproduction: x })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default delivery lead time (days)">
              <Input type="number" min="0" value={v.defaultDeliveryLeadDays} disabled={disabled}
                onChange={(e) => setV({ ...v, defaultDeliveryLeadDays: Number(e.target.value) })} />
            </Field>
            <Field label="Show 'due soon' within (days)">
              <Input type="number" min="0" value={v.dueSoonDays} disabled={disabled}
                onChange={(e) => setV({ ...v, dueSoonDays: Number(e.target.value) })} />
            </Field>
          </div>
        </CardBody>
      </Card>

      {canManage ? <Button size="lg" onClick={save} loading={saving}>Save settings</Button> : null}
    </div>
  );
}

export function Toggle({ label, description, checked, onChange, disabled }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        {description ? <p className="text-[12px] text-ink-subtle">{description}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}
