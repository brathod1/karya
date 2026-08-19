"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { updateSettingsAction } from "@/server/actions/settings";
import type { ModuleKey } from "@/lib/settings";

const AVAILABLE: { key: ModuleKey; label: string; description: string }[] = [
  { key: "orders", label: "Orders", description: "The core record of what you've sold." },
  { key: "customers", label: "Customers", description: "Who buys from you, and what they owe." },
  { key: "products", label: "Products", description: "Your catalogue and pricing." },
  { key: "payments", label: "Payments", description: "Money received and outstanding balances." },
  { key: "expenses", label: "Expenses", description: "Money going out, by category." },
  { key: "events", label: "Events & production", description: "Plan what to make for stalls, fairs and batches." },
  { key: "analytics", label: "Analytics", description: "Charts and reports over everything above." },
];

const PLANNED: { key: ModuleKey; label: string; description: string }[] = [
  { key: "inventory", label: "Inventory", description: "Stock levels and movements." },
  { key: "suppliers", label: "Suppliers", description: "Who you buy from, and purchase orders." },
  { key: "invoices", label: "Invoices", description: "Formal invoices with tax handling." },
  { key: "delivery", label: "Delivery", description: "Courier tracking and dispatch." },
  { key: "staff", label: "Staff", description: "Team members and assignments." },
];

export function ModulesForm({ initial }: { initial: Record<ModuleKey, boolean> }) {
  const router = useRouter();
  const toast = useToast();
  const [modules, setModules] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const result = await updateSettingsAction({ modules });
    setSaving(false);
    if (!result.ok) return toast.push(result.error, "error");
    toast.push("Modules updated");
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader title="Modules" description="Switch off what you don't use. Nothing is deleted — turning a module back on restores it exactly." />
        <CardBody className="space-y-2.5">
          {AVAILABLE.map((m) => (
            <div key={m.key} className="flex items-start justify-between gap-4 rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
              <div>
                <p className="text-[13px] font-medium">{m.label}</p>
                <p className="text-[12px] text-ink-subtle">{m.description}</p>
              </div>
              <Switch checked={modules[m.key]} onChange={(v) => setModules({ ...modules, [m.key]: v })} label={m.label} />
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Not built yet" description="The database and permissions already account for these. They'll appear here when they ship." />
        <CardBody className="space-y-2.5">
          {PLANNED.map((m) => (
            <div key={m.key} className="flex items-start justify-between gap-4 rounded-lg px-3 py-2.5 ring-1 ring-line opacity-60">
              <div>
                <p className="text-[13px] font-medium">{m.label}</p>
                <p className="text-[12px] text-ink-subtle">{m.description}</p>
              </div>
              <Badge color="neutral">Coming later</Badge>
            </div>
          ))}
        </CardBody>
      </Card>

      <Button size="lg" onClick={save} loading={saving}>Save modules</Button>
    </div>
  );
}
