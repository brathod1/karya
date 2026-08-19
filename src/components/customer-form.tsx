"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardBody, CardHeader } from "./ui/card";
import { Field, Input, Textarea } from "./ui/field";
import { CustomFields, type FieldDef } from "./custom-fields";
import { useConfig } from "./config-provider";
import { useToast } from "./ui/toast";
import { createCustomerAction, updateCustomerAction } from "@/server/actions/entities";

export type CustomerInitial = {
  id: string; name: string; phone: string | null; email: string | null;
  address: string | null; notes: string | null; tags: string[]; customFields: Record<string, unknown>;
};

export function CustomerForm({ fieldDefs, initial }: { fieldDefs: FieldDef[]; initial?: CustomerInitial }) {
  const { t } = useConfig();
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState({
    name: initial?.name ?? "", phone: initial?.phone ?? "", email: initial?.email ?? "",
    address: initial?.address ?? "", notes: initial?.notes ?? "", tags: (initial?.tags ?? []).join(", "),
  });
  const [custom, setCustom] = useState<Record<string, unknown>>(initial?.customFields ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    const payload = {
      ...values,
      email: values.email || null,
      tags: values.tags.split(",").map((s) => s.trim()).filter(Boolean),
      customFields: custom,
    };
    const result = initial ? await updateCustomerAction(initial.id, payload) : await createCustomerAction(payload);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    toast.push(initial ? "Saved" : `${values.name} added`);
    router.push(initial ? `/customers/${initial.id}` : "/customers");
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
            <Input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Phone"><Input value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} /></Field>
          <Field label="Tags" help="Comma separated, e.g. reseller, regular" className="sm:col-span-2">
            <Input value={values.tags} onChange={(e) => setValues({ ...values, tags: e.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} /></Field>
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
        <Button onClick={submit} loading={saving} size="lg">{initial ? "Save changes" : `Add ${t("customer").toLowerCase()}`}</Button>
        <Button variant="secondary" size="lg" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  );
}
