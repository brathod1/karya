"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardBody, CardHeader } from "./ui/card";
import { Field, Input, Select, Textarea } from "./ui/field";
import { MoneyInput } from "./money-input";
import { CustomFields, type FieldDef } from "./custom-fields";
import { useConfig } from "./config-provider";
import { useToast } from "./ui/toast";
import { createExpenseAction, updateExpenseAction } from "@/server/actions/entities";
import { createCategoryInlineAction } from "@/server/actions/settings";
import { Combobox } from "./combobox";
import { AttachmentPanel, uploadPendingFiles } from "./attachments";
import { toInputDate } from "@/lib/format";

export type ExpenseInitial = {
  id: string; date: string; description: string; categoryId: string | null;
  amountMinor: number; methodId: string | null; vendor: string | null; notes: string | null;
  customFields: Record<string, unknown>;
};

export function ExpenseForm({ categories, methods, fieldDefs, initial }: {
  categories: { id: string; name: string }[];
  methods: { id: string; label: string }[];
  fieldDefs: FieldDef[];
  initial?: ExpenseInitial;
}) {
  const { t } = useConfig();
  const router = useRouter();
  const toast = useToast();

  const [date, setDate] = useState(initial?.date ?? toInputDate(new Date()));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [categoryList, setCategoryList] = useState(categories);
  const [amountMinor, setAmountMinor] = useState(initial?.amountMinor ?? 0);
  const [methodId, setMethodId] = useState(initial?.methodId ?? methods[0]?.id ?? "");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [custom, setCustom] = useState<Record<string, unknown>>(initial?.customFields ?? {});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (amountMinor <= 0) { setError("Enter an amount."); return; }
    setSaving(true);
    const payload = {
      date: new Date(date), description, categoryId,
      amountMinor, methodId: methodId || null, vendor: vendor || null, notes: notes || null,
      customFields: custom,
    };
    let expenseId = initial?.id ?? null;
    if (initial) {
      const result = await updateExpenseAction(initial.id, payload);
      if (!result.ok) { setSaving(false); setError(result.error); return; }
    } else {
      const result = await createExpenseAction(payload);
      if (!result.ok) { setSaving(false); setError(result.error); return; }
      expenseId = result.data.id;
    }

    // Files chosen before the record existed are attached now that it has an id.
    if (expenseId && pendingFiles.length > 0) {
      const failures = await uploadPendingFiles("EXPENSE", expenseId, pendingFiles);
      failures.forEach((message) => toast.push(message, "error"));
    }

    setSaving(false);
    toast.push(initial ? "Saved" : `${t("expense")} recorded`);
    router.push("/expenses");
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
        <CardBody className="grid gap-4 sm:grid-cols-2 pt-5">
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Amount" required><MoneyInput valueMinor={amountMinor} onChange={setAmountMinor} /></Field>
          <Field label="What was it for?" required className="sm:col-span-2">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cotton yarn — 20 skeins" autoFocus />
          </Field>
          <Field label="Category" help="Type a new one to create it here.">
            <Combobox
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Uncategorised"
              options={categoryList.map((c) => ({ value: c.id, label: c.name }))}
              createLabel="Create category"
              emptyText="No categories yet"
              onCreate={async (name) => {
                const result = await createCategoryInlineAction("EXPENSE", name);
                if (!result.ok) { toast.push(result.error, "error"); return null; }
                if (!result.data.reused) {
                  setCategoryList((prev) => [...prev, { id: result.data.id, name: result.data.name }]);
                  toast.push(`Category "${result.data.name}" created`);
                }
                return result.data.id;
              }}
            />
          </Field>
          <Field label="Paid by">
            <Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">Not specified</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Vendor" className="sm:col-span-2"><Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Receipt" description="Photograph the bill now; it attaches when you save." />
        <CardBody>
          <AttachmentPanel
            entityType="EXPENSE"
            entityId={initial?.id ?? null}
            pending={pendingFiles}
            onPendingChange={setPendingFiles}
            label="Files"
            help="Attach a photo of the bill, or a PDF invoice"
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
        <Button onClick={submit} loading={saving} size="lg">{initial ? "Save changes" : `Add ${t("expense").toLowerCase()}`}</Button>
        <Button variant="secondary" size="lg" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  );
}
