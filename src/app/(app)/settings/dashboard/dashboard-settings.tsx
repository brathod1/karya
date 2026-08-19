"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { updateSettingsAction } from "@/server/actions/settings";
import type { ModuleKey, WidgetKey } from "@/lib/settings";

type Widget = { key: WidgetKey; enabled: boolean; order: number; range?: string };

const META: Record<WidgetKey, { label: string; description: string; module?: ModuleKey }> = {
  today: { label: "Today", description: "Orders, sales, collected, outstanding and expenses for today." },
  needsAttention: { label: "Needs attention", description: "In production, due today, overdue, awaiting payment.", module: "orders" },
  productionProgress: { label: "Production progress", description: "Your next event and how much is made.", module: "events" },
  topProducts: { label: "Top products", description: "Best sellers this month.", module: "products" },
  expenses: { label: "Expenses", description: "This month by category.", module: "expenses" },
  revenueChart: { label: "Revenue chart", description: "Sales and expenses over the last six months.", module: "analytics" },
  outstanding: { label: "Who owes you", description: "The five largest outstanding balances.", module: "payments" },
  recentActivity: { label: "Recent activity", description: "The latest things that happened." },
  profit: { label: "Estimated profit", description: "Only meaningful when cost tracking is on." },
};

export function DashboardSettings({ initial, modules }: { initial: Widget[]; modules: Record<ModuleKey, boolean> }) {
  const router = useRouter();
  const toast = useToast();
  const [widgets, setWidgets] = useState<Widget[]>([...initial].sort((a, b) => a.order - b.order));
  const [saving, setSaving] = useState(false);

  function move(index: number, direction: -1 | 1) {
    const next = [...widgets];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setWidgets(next.map((w, i) => ({ ...w, order: i + 1 })));
  }

  async function save() {
    setSaving(true);
    const result = await updateSettingsAction({ dashboard: { widgets: widgets.map((w, i) => ({ ...w, order: i + 1 })) } });
    setSaving(false);
    if (!result.ok) return toast.push(result.error, "error");
    toast.push("Dashboard updated");
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader title="Dashboard widgets" description="Choose what you see first, and in what order." />
        <CardBody>
          <ul className="divide-y divide-line">
            {widgets.map((widget, index) => {
              const meta = META[widget.key];
              const unavailable = meta.module ? !modules[meta.module] : false;
              return (
                <li key={widget.key} className="flex items-center gap-3 py-2.5">
                  <div className="flex flex-col">
                    <button aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}
                      className="text-ink-subtle hover:text-ink disabled:opacity-30"><ChevronUp className="size-3.5" /></button>
                    <button aria-label="Move down" disabled={index === widgets.length - 1} onClick={() => move(index, 1)}
                      className="text-ink-subtle hover:text-ink disabled:opacity-30"><ChevronDown className="size-3.5" /></button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{meta.label}</p>
                    <p className="text-[12px] text-ink-subtle">{meta.description}</p>
                  </div>
                  {unavailable ? <Badge color="neutral">Module off</Badge> : null}
                  <Switch checked={widget.enabled && !unavailable} disabled={unavailable} label={meta.label}
                    onChange={(v) => setWidgets(widgets.map((w) => (w.key === widget.key ? { ...w, enabled: v } : w)))} />
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
      <Button size="lg" onClick={save} loading={saving}>Save dashboard</Button>
    </div>
  );
}
