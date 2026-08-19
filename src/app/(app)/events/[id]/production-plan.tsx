"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { MoneyInput } from "@/components/money-input";
import { ProgressBar } from "@/components/progress";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty";
import { useConfig } from "@/components/config-provider";
import { useToast } from "@/components/ui/toast";
import { addProductionItemAction, removeProductionItemAction, updateProductionItemAction } from "@/server/actions/entities";
import { computeProductionLine } from "@/server/domain/events";
import { cn } from "@/lib/cn";

type Row = {
  id: string; productId: string | null; name: string;
  categoryId: string | null; categoryName: string | null;
  quantityPlanned: number; quantityCompleted: number; unitPriceMinor: number; note: string | null;
};

const STATUS_STYLE = { NOT_STARTED: "neutral", IN_PROGRESS: "amber", COMPLETE: "emerald" } as const;
const STATUS_LABEL = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETE: "Complete" } as const;

export function ProductionPlan({ eventId, rows, products, categories, threshold }: {
  eventId: string; rows: Row[];
  products: { id: string; name: string; defaultPriceMinor: number }[];
  categories: { id: string; name: string }[];
  threshold: number;
}) {
  const { money, t, can } = useConfig();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const [productId, setProductId] = useState("");
  const [planned, setPlanned] = useState("10");
  const [priceMinor, setPriceMinor] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = can("event:manage");
  const visible = filter ? rows.filter((r) => r.categoryId === filter) : rows;

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of visible) {
      const key = row.categoryName ?? "Uncategorised";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [visible]);

  async function setCompleted(row: Row, next: number) {
    setBusy(row.id);
    const result = await updateProductionItemAction(eventId, row.id, { quantityCompleted: Math.max(next, 0) });
    setBusy(null);
    if (result.ok) router.refresh();
    else toast.push(result.error, "error");
  }

  async function addLine() {
    setError(null);
    setSaving(true);
    const result = await addProductionItemAction(eventId, {
      productId: productId || null,
      quantityPlanned: Number(planned) || 0,
      unitPriceMinor: priceMinor,
    });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    toast.push("Line added");
    setOpen(false);
    setProductId(""); setPlanned("10"); setPriceMinor(0);
    router.refresh();
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader
          title="Production plan"
          description="What to make, and how much is done."
          action={
            <div className="flex items-center gap-2">
              {categories.length > 0 ? (
                <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 w-40 text-[13px]">
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              ) : null}
              {editable ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus className="size-3.5" />Add line</Button> : null}
            </div>
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing planned yet"
            description={`Add the ${t("product", "many").toLowerCase()} you need to make, and how many of each.`}
            action={editable ? <Button size="sm" onClick={() => setOpen(true)}>Add first line</Button> : undefined}
          />
        ) : (
          <div className="border-t border-line">
            {grouped.map(([category, lines]) => (
              <div key={category}>
                <div className="bg-stone-50 px-5 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
                  {category}
                </div>
                <ul className="divide-y divide-line">
                  {lines.map((row) => {
                    const result = computeProductionLine(row, threshold);
                    return (
                      <li key={row.id} className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="min-w-[160px] flex-1">
                            <p className="font-medium text-[13.5px]">{row.name}</p>
                            <p className="text-[12px] text-ink-subtle tabular">
                              {money(row.unitPriceMinor)} each · {money(result.expectedRevenueMinor)} if all sell
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {editable ? (
                              <Button variant="secondary" size="icon" aria-label="One less made" disabled={busy === row.id || row.quantityCompleted <= 0}
                                onClick={() => setCompleted(row, row.quantityCompleted - 1)}>
                                <Minus className="size-3.5" />
                              </Button>
                            ) : null}
                            <span className="tabular text-[13.5px] font-medium w-20 text-center">
                              {row.quantityCompleted} / {row.quantityPlanned}
                            </span>
                            {editable ? (
                              <Button variant="secondary" size="icon" aria-label="One more made" disabled={busy === row.id}
                                onClick={() => setCompleted(row, row.quantityCompleted + 1)}>
                                <Plus className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>

                          <div className="w-28 text-right tabular text-[13px] text-ink-muted">
                            {result.remaining} left
                          </div>

                          <Badge color={STATUS_STYLE[result.status]} dot>{STATUS_LABEL[result.status]}</Badge>

                          {editable ? (
                            <Button variant="ghost" size="icon" aria-label="Remove line"
                              onClick={async () => {
                                const r = await removeProductionItemAction(eventId, row.id);
                                if (r.ok) { toast.push("Line removed"); router.refresh(); }
                                else toast.push(r.error, "error");
                              }}>
                              <Trash2 className="size-3.5 text-ink-subtle" />
                            </Button>
                          ) : null}
                        </div>
                        <ProgressBar className="mt-2" value={result.progressPct}
                          tone={result.status === "COMPLETE" ? "emerald" : "brand"}
                          label={`${row.name} progress`} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Sheet
        open={open} onClose={() => setOpen(false)} width="sm"
        title="Add production line"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={addLine} loading={saving}>Add line</Button></>}
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">{error}</p> : null}
          <Field label={t("product")} required>
            <Select value={productId} onChange={(e) => {
              setProductId(e.target.value);
              const p = products.find((x) => x.id === e.target.value);
              if (p) setPriceMinor(p.defaultPriceMinor);
            }}>
              <option value="">Choose…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Quantity to make" required>
            <Input type="number" min="1" value={planned} onChange={(e) => setPlanned(e.target.value)} className="tabular" />
          </Field>
          <Field label="Expected price each">
            <MoneyInput valueMinor={priceMinor} onChange={setPriceMinor} />
          </Field>
          <p className={cn("rounded-lg bg-stone-100 px-3 py-2.5 text-[12.5px] text-ink-muted")}>
            Expected revenue: <span className="tabular font-medium text-ink">{money(Math.round(priceMinor * (Number(planned) || 0)))}</span>
          </p>
        </div>
      </Sheet>
    </>
  );
}
