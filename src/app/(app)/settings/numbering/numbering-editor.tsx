"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { updateSequenceAction } from "@/server/actions/settings";
import { renderNumber } from "@/lib/numbering-format";

type Row = {
  entityType: string; prefix: string; pattern: string;
  nextValue: number; resetPolicy: "NEVER" | "YEARLY" | "MONTHLY";
};

const LABELS: Record<string, string> = {
  ORDER: "Orders", CUSTOMER: "Customers", PRODUCT: "Products", EXPENSE: "Expenses", EVENT: "Events",
};

const PATTERNS = [
  { value: "{PREFIX}-{SEQ:5}", label: "PRE-00042" },
  { value: "{PREFIX}-{YYYY}-{SEQ:4}", label: "PRE-2026-0042" },
  { value: "{PREFIX}-{YY}{MM}-{SEQ:4}", label: "PRE-2608-0042" },
  { value: "{PREFIX}{SEQ:6}", label: "PRE000042" },
];

export function NumberingEditor({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(rows);
  const [saving, setSaving] = useState<string | null>(null);

  async function save(row: Row) {
    setSaving(row.entityType);
    const result = await updateSequenceAction(row);
    setSaving(null);
    if (!result.ok) return toast.push(result.error, "error");
    toast.push("Numbering updated");
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader
          title="Document numbering"
          description="These are labels, not identity — changing them never breaks a link between records."
        />
        <CardBody className="space-y-5">
          {state.map((row, index) => (
            <div key={row.entityType} className="rounded-lg bg-stone-50 p-3 ring-1 ring-line">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-[13px] font-semibold">{LABELS[row.entityType] ?? row.entityType}</p>
                <p className="tabular text-[13px] text-ink-muted">
                  Next: {renderNumber(row.pattern, row.prefix, row.nextValue)}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Prefix">
                  <Input value={row.prefix} maxLength={8}
                    onChange={(e) => setState(state.map((r, i) => (i === index ? { ...r, prefix: e.target.value.toUpperCase() } : r)))} />
                </Field>
                <Field label="Format">
                  <Select value={row.pattern}
                    onChange={(e) => setState(state.map((r, i) => (i === index ? { ...r, pattern: e.target.value } : r)))}>
                    {PATTERNS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </Field>
                <Field label="Next number">
                  <Input type="number" min="1" value={row.nextValue} className="tabular"
                    onChange={(e) => setState(state.map((r, i) => (i === index ? { ...r, nextValue: Number(e.target.value) } : r)))} />
                </Field>
                <Field label="Restart">
                  <Select value={row.resetPolicy}
                    onChange={(e) => setState(state.map((r, i) => (i === index ? { ...r, resetPolicy: e.target.value as Row["resetPolicy"] } : r)))}>
                    <option value="NEVER">Never</option>
                    <option value="YEARLY">Every year</option>
                    <option value="MONTHLY">Every month</option>
                  </Select>
                </Field>
              </div>
              <Button size="sm" className="mt-3" loading={saving === row.entityType} onClick={() => save(row)}>Save</Button>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
