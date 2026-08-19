"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { updateSettingsAction } from "@/server/actions/settings";

type Term = { one: string; many: string };
type Terminology = Record<string, Term>;

const ROWS: { key: string; description: string; examples: string }[] = [
  { key: "customer", description: "The people who buy from you", examples: "Customer · Client · Buyer · Guest · Patient" },
  { key: "product", description: "What you sell", examples: "Product · Item · Service · SKU · Menu item" },
  { key: "order", description: "A single sale or job", examples: "Order · Booking · Job · Project · Ticket" },
  { key: "event", description: "A stall, market, or batch of production", examples: "Event · Stall · Campaign · Production run" },
  { key: "expense", description: "Money going out", examples: "Expense · Cost · Purchase · Spend" },
  { key: "payment", description: "Money coming in", examples: "Payment · Receipt · Collection" },
];

export function TerminologyForm({ initial }: { initial: Terminology }) {
  const router = useRouter();
  const toast = useToast();
  const [terms, setTerms] = useState<Terminology>(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await updateSettingsAction({ terminology: terms });
    setSaving(false);
    if (!result.ok) return toast.push(result.error, "error");
    toast.push("Terminology updated across the whole app");
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader
          title="Terminology"
          description="Change what things are called. Only labels change — your data and history are untouched."
        />
        <CardBody className="space-y-4">
          {ROWS.map((row) => (
            <div key={row.key} className="grid gap-3 sm:grid-cols-[1fr_140px_140px] sm:items-end">
              <div>
                <p className="text-[13px] font-medium capitalize">{row.key}</p>
                <p className="text-[12px] text-ink-subtle">{row.description}</p>
                <p className="text-[11.5px] text-ink-subtle italic">{row.examples}</p>
              </div>
              <div>
                <Label>Singular</Label>
                <Input value={terms[row.key]?.one ?? ""} onChange={(e) => setTerms({ ...terms, [row.key]: { ...terms[row.key], one: e.target.value } })} />
              </div>
              <div>
                <Label>Plural</Label>
                <Input value={terms[row.key]?.many ?? ""} onChange={(e) => setTerms({ ...terms, [row.key]: { ...terms[row.key], many: e.target.value } })} />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Preview" />
        <CardBody className="space-y-1.5 text-[13px] text-ink-muted">
          <p>Sidebar: {terms.order?.many} · {terms.customer?.many} · {terms.product?.many} · {terms.event?.many} · {terms.expense?.many}</p>
          <p>Button: “New {terms.order?.one.toLowerCase()}”</p>
          <p>Empty state: “No {terms.customer?.many.toLowerCase()} yet”</p>
        </CardBody>
      </Card>

      <Button size="lg" onClick={save} loading={saving}>Save terminology</Button>
    </div>
  );
}
