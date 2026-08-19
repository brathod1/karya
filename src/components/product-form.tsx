"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardBody, CardHeader } from "./ui/card";
import { Field, Input, Switch, Textarea } from "./ui/field";
import { MoneyInput } from "./money-input";
import { CustomFields, type FieldDef } from "./custom-fields";
import { useConfig } from "./config-provider";
import { useToast } from "./ui/toast";
import { createProductAction, updateProductAction } from "@/server/actions/entities";
import { createCategoryInlineAction } from "@/server/actions/settings";
import { Combobox } from "./combobox";
import { AttachmentPanel, uploadPendingFiles } from "./attachments";

export type ProductInitial = {
  id: string; name: string; description: string | null; categoryId: string | null;
  defaultPriceMinor: number; costMinor: number | null; unit: string;
  notes: string | null; isActive: boolean; customFields: Record<string, unknown>;
};

export function ProductForm({ categories, fieldDefs, initial }: {
  categories: { id: string; name: string }[];
  fieldDefs: FieldDef[];
  initial?: ProductInitial;
}) {
  const { t, pricing } = useConfig();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [categoryList, setCategoryList] = useState(categories);
  const [priceMinor, setPriceMinor] = useState(initial?.defaultPriceMinor ?? 0);
  const [costMinor, setCostMinor] = useState(initial?.costMinor ?? 0);
  const [unit, setUnit] = useState(initial?.unit ?? "pcs");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [custom, setCustom] = useState<Record<string, unknown>>(initial?.customFields ?? {});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    const payload = {
      name, description: description || null, categoryId,
      defaultPriceMinor: priceMinor, costMinor: pricing.enableCostTracking ? costMinor || null : null,
      unit, notes: notes || null, isActive, customFields: custom,
    };
    let productId = initial?.id ?? null;
    if (initial) {
      const result = await updateProductAction(initial.id, payload);
      if (!result.ok) { setSaving(false); setError(result.error); return; }
    } else {
      const result = await createProductAction(payload);
      if (!result.ok) { setSaving(false); setError(result.error); return; }
      productId = result.data.id;
    }

    if (productId && pendingFiles.length > 0) {
      const failures = await uploadPendingFiles("PRODUCT", productId, pendingFiles);
      failures.forEach((message) => toast.push(message, "error"));
    }

    setSaving(false);
    toast.push(initial ? "Saved" : `${name} added`);
    router.push("/products");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-4">
      {error ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
          <AlertCircle className="size-4 mt-px shrink-0" />{error}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Details" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Category" help="Type a new one and create it without leaving this form.">
            <Combobox
              value={categoryId}
              onChange={setCategoryId}
              placeholder="None"
              options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
              createLabel="Create category"
              emptyText="No categories yet"
              onCreate={async (name) => {
                const result = await createCategoryInlineAction("PRODUCT", name);
                if (!result.ok) { toast.push(result.error, "error"); return null; }
                if (!result.data.reused) {
                  setCategoryList((prev) => [...prev, { id: result.data.id, name: result.data.name }]);
                  toast.push(`Category "${result.data.name}" created`);
                }
                return result.data.id;
              }}
            />
          </Field>
          <Field label="Unit" help="pcs, kg, set — whatever you sell in.">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </Field>
          <Field label="Default price" help={`Used unless a ${t("customer").toLowerCase()} has an agreed price.`}>
            <MoneyInput valueMinor={priceMinor} onChange={setPriceMinor} />
          </Field>
          {pricing.enableCostTracking ? (
            <Field label="Cost" help="Optional. Enables profit estimates.">
              <MoneyInput valueMinor={costMinor} onChange={setCostMinor} />
            </Field>
          ) : null}
          <Field label="Description" className="sm:col-span-2">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
            <div>
              <p className="text-[13px] font-medium">Active</p>
              <p className="text-[12px] text-ink-subtle">Inactive {t("product", "many").toLowerCase()} stay on past orders but stop appearing in pickers.</p>
            </div>
            <Switch checked={isActive} onChange={setIsActive} label="Active" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Photos" />
        <CardBody>
          <AttachmentPanel
            entityType="PRODUCT"
            entityId={initial?.id ?? null}
            pending={pendingFiles}
            onPendingChange={setPendingFiles}
            label="Files"
            help="Attach photos of this item"
          />
        </CardBody>
      </Card>

      {fieldDefs.length > 0 ? (
        <Card>
          <CardHeader title="More details" />
          <CardBody>
            <CustomFields defs={fieldDefs} values={custom} onChange={(k, v) => setCustom((p) => ({ ...p, [k]: v }))} />
          </CardBody>
        </Card>
      ) : null}

      <div className="flex gap-2">
        <Button onClick={submit} loading={saving} size="lg">{initial ? "Save changes" : `Add ${t("product").toLowerCase()}`}</Button>
        <Button variant="secondary" size="lg" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  );
}
