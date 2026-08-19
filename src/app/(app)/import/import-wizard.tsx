"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, FileSpreadsheet, Upload } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Switch } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { previewSpreadsheetAction, runImportAction } from "@/server/actions/import";
import {
  IMPORT_FIELDS,
  type ImportIssue, type ImportResult, type ImportTarget, type SheetPreview,
} from "@/lib/import-fields";
import { cn } from "@/lib/cn";

const STEPS = ["Upload", "Map columns", "Preview & check", "Import"] as const;

export function ImportWizard({ terms }: { terms: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [target, setTarget] = useState<ImportTarget>("orders");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [createMissing, setCreateMissing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const fields = IMPORT_FIELDS[target];
  const missingRequired = fields.filter((f) => f.required && !mapping[f.key]);

  async function upload(selected: File) {
    setError(null);
    setBusy(true);
    setFile(selected);
    const form = new FormData();
    form.set("file", selected);
    form.set("target", target);
    const response = await previewSpreadsheetAction(form);
    setBusy(false);
    if (!response.ok) { setError(response.error); return; }
    setPreview(response.data);
    setMapping(response.data.suggested);
    setStep(1);
  }

  async function runImport() {
    if (!preview || !file) return;
    setBusy(true);
    setError(null);
    const response = await runImportAction({
      target, mapping, rows: preview.rows, fileName: file.name, createMissing,
    });
    setBusy(false);
    if (!response.ok) { setError(response.error); return; }
    setResult(response.data);
    setStep(3);
    toast.push(`${response.data.created} rows imported`);
    router.refresh();
  }

  const localValidation: ImportIssue[] = preview
    ? preview.rows.slice(0, 200).flatMap((row, index) =>
        fields.filter((f) => f.required && mapping[f.key] && !(row[mapping[f.key]] ?? "").trim())
          .map((f) => ({ row: index + 2, field: f.label, message: "Empty required value", severity: "error" as const })),
      )
    : [];

  return (
    <Card>
      <CardHeader title="Import from a spreadsheet" description="Google Sheets → File → Download → Microsoft Excel (.xlsx), then upload it here." />
      <CardBody className="space-y-5">
        <ol className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium",
                index === step ? "bg-teal-50 text-brand ring-1 ring-teal-200"
                  : index < step ? "text-emerald-700" : "text-ink-subtle")}>
                {index < step ? <Check className="size-3.5" /> : <span className="tabular">{index + 1}</span>}
                {label}
              </span>
              {index < STEPS.length - 1 ? <ArrowRight className="size-3 text-ink-subtle" /> : null}
            </li>
          ))}
        </ol>

        {error ? (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
            <AlertTriangle className="size-4 mt-px shrink-0" />{error}
          </p>
        ) : null}

        {step === 0 ? (
          <div className="space-y-4">
            <div className="max-w-xs">
              <label className="mb-1.5 block text-[13px] font-medium text-ink-muted">What are you importing?</label>
              <Select value={target} onChange={(e) => setTarget(e.target.value as ImportTarget)}>
                <option value="orders">{terms.order}</option>
                <option value="customers">{terms.customer}</option>
                <option value="products">{terms.product}</option>
                <option value="expenses">{terms.expense}</option>
              </Select>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong bg-stone-50 px-6 py-10 text-center hover:bg-stone-100">
              <Upload className="size-6 text-ink-subtle" />
              <span className="text-[13.5px] font-medium">Choose a file</span>
              <span className="text-[12px] text-ink-subtle">.xlsx, .xls or .csv</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            </label>
            {busy ? <p className="text-[13px] text-ink-muted">Reading your file…</p> : null}
          </div>
        ) : null}

        {step === 1 && preview ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[13px] text-ink-muted">
              <FileSpreadsheet className="size-4" />
              <span className="font-medium text-ink">{file?.name}</span>
              <span>· {preview.rows.length} rows · {preview.columns.length} columns</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-[12.5px] font-medium text-ink-muted">
                    {f.label}{f.required ? <span className="text-red-600"> *</span> : null}
                  </label>
                  <Select value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                    <option value="">Not imported</option>
                    {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                  {f.note ? <p className="mt-1 text-[11.5px] text-ink-subtle">{f.note}</p> : null}
                </div>
              ))}
            </div>

            {target === "orders" ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900 ring-1 ring-amber-200">
                <span className="font-medium">Balance Due is deliberately not imported.</span> It is calculated from payments,
                so the advance you map above becomes a real payment record and the balance recomputes itself. This is what
                stops the app and your old sheet from ever quietly disagreeing.
              </p>
            ) : null}

            {target === "orders" ? (
              <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
                <div>
                  <p className="text-[13px] font-medium">Create missing {terms.customer.toLowerCase()} and {terms.product.toLowerCase()}</p>
                  <p className="text-[12px] text-ink-subtle">Off means rows referencing unknown records are skipped instead.</p>
                </div>
                <Switch checked={createMissing} onChange={setCreateMissing} label="Create missing records" />
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button onClick={() => setStep(2)} disabled={missingRequired.length > 0}>
                Preview {preview.rows.length} rows
              </Button>
              <Button variant="secondary" onClick={() => { setStep(0); setPreview(null); }}>Start over</Button>
            </div>
            {missingRequired.length > 0 ? (
              <p className="text-[12.5px] text-red-700">Map these first: {missingRequired.map((f) => f.label).join(", ")}</p>
            ) : null}
          </div>
        ) : null}

        {step === 2 && preview ? (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg ring-1 ring-line">
              <table className="w-full text-[12.5px]">
                <thead className="bg-stone-50">
                  <tr>
                    {fields.filter((f) => mapping[f.key]).map((f) => (
                      <th key={f.key} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-ink-muted">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 20).map((row, index) => (
                    <tr key={index} className="border-t border-line">
                      {fields.filter((f) => mapping[f.key]).map((f) => (
                        <td key={f.key} className="whitespace-nowrap px-3 py-1.5">{row[mapping[f.key]] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12.5px] text-ink-subtle">
              Showing the first 20 of {preview.rows.length} rows.
            </p>

            {localValidation.length > 0 ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200">
                <p className="text-[13px] font-medium text-amber-900">{localValidation.length} rows have empty required values</p>
                <ul className="mt-1 space-y-0.5 text-[12px] text-amber-800">
                  {localValidation.slice(0, 5).map((issue, i) => (
                    <li key={i}>Row {issue.row}: {issue.field} is empty</li>
                  ))}
                </ul>
                <p className="mt-1 text-[12px] text-amber-800">They will be skipped and listed in the report.</p>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button onClick={runImport} loading={busy}>Import {preview.rows.length} rows</Button>
              <Button variant="secondary" onClick={() => setStep(1)}>Back to mapping</Button>
            </div>
          </div>
        ) : null}

        {step === 3 && result ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Imported" value={result.created} tone="emerald" />
              <Stat label="Skipped" value={result.skipped} tone={result.skipped ? "red" : "neutral"} />
              <Stat label={`New ${terms.customer.toLowerCase()}`} value={result.createdCustomers} tone="neutral" />
              <Stat label={`New ${terms.product.toLowerCase()}`} value={result.createdProducts} tone="neutral" />
            </div>

            {result.issues.length > 0 ? (
              <div className="rounded-lg ring-1 ring-line">
                <p className="border-b border-line px-3 py-2 text-[13px] font-medium">Report</p>
                <ul className="max-h-64 divide-y divide-line overflow-y-auto">
                  {result.issues.map((issue, i) => (
                    <li key={i} className="flex items-baseline gap-2 px-3 py-1.5 text-[12.5px]">
                      <Badge color={issue.severity === "error" ? "red" : "amber"}>Row {issue.row}</Badge>
                      <span className="text-ink-muted">{issue.field}</span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-900 ring-1 ring-emerald-200">
                Every row imported cleanly.
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={() => { setStep(0); setPreview(null); setResult(null); setFile(null); }}>Import another file</Button>
              <Button variant="secondary" onClick={() => router.push(`/${target}`)}>View {target}</Button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "red" | "neutral" }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
      <p className="text-[11.5px] uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className={cn("mt-0.5 text-[22px] font-semibold tabular",
        tone === "emerald" && "text-emerald-700", tone === "red" && "text-red-700")}>{value}</p>
    </div>
  );
}
