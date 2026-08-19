"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { createStatusAction, reorderStatusesAction, updateStatusAction } from "@/server/actions/settings";
import { STATUS_COLORS } from "@/lib/colors";

type Status = {
  id: string; key: string; label: string; color: string; sortOrder: number;
  isDefault: boolean; isCompleted: boolean; isActive: boolean;
  semantic: "NONE" | "PRODUCTION" | "SHIPMENT" | "COMPLETION" | "CANCELLED";
};

const SEMANTICS: { value: Status["semantic"]; label: string; help: string }[] = [
  { value: "NONE", label: "Just a stage", help: "No special meaning." },
  { value: "PRODUCTION", label: "Being made", help: "Counted in “in production” on the dashboard." },
  { value: "SHIPMENT", label: "Shipping", help: "Counted in “ready to ship or in transit”." },
  { value: "COMPLETION", label: "Finished", help: "The work is done." },
  { value: "CANCELLED", label: "Cancelled", help: "Excluded from revenue figures." },
];

export function StatusesEditor({ statuses, orderTerm }: { statuses: Status[]; orderTerm: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Status | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<Status>>({ label: "", color: "neutral", semantic: "NONE" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(index: number, direction: -1 | 1) {
    const next = [...statuses];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const result = await reorderStatusesAction(next.map((s) => s.id));
    if (result.ok) router.refresh();
    else toast.push(result.error, "error");
  }

  async function save() {
    setError(null);
    setSaving(true);
    const payload = {
      label: draft.label ?? "", color: draft.color ?? "neutral",
      semantic: draft.semantic ?? "NONE",
      isCompleted: !!draft.isCompleted, isDefault: !!draft.isDefault, isActive: draft.isActive ?? true,
    };
    const result = editing ? await updateStatusAction(editing.id, payload) : await createStatusAction(payload);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    toast.push(editing ? "Status updated" : "Status added");
    setEditing(null); setCreating(false);
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader
          title={`${orderTerm} statuses`}
          description="Your own stages, in your own words. Renaming a status updates every order that already uses it."
          action={<Button size="sm" variant="secondary" onClick={() => { setDraft({ label: "", color: "neutral", semantic: "NONE", isActive: true }); setCreating(true); }}>
            <Plus className="size-3.5" />Add status
          </Button>}
        />
        <CardBody>
          <ul className="divide-y divide-line">
            {statuses.map((status, index) => (
              <li key={status.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex flex-col">
                  <button aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}
                    className="text-ink-subtle hover:text-ink disabled:opacity-30"><ChevronUp className="size-3.5" /></button>
                  <button aria-label="Move down" disabled={index === statuses.length - 1} onClick={() => move(index, 1)}
                    className="text-ink-subtle hover:text-ink disabled:opacity-30"><ChevronDown className="size-3.5" /></button>
                </div>
                <Badge color={status.color} dot>{status.label}</Badge>
                <div className="flex flex-wrap gap-1.5">
                  {status.isDefault ? <Badge color="teal">Default for new</Badge> : null}
                  {status.isCompleted ? <Badge color="emerald">Counts as done</Badge> : null}
                  {status.semantic !== "NONE" ? <Badge color="slate">{SEMANTICS.find((s) => s.value === status.semantic)?.label}</Badge> : null}
                  {!status.isActive ? <Badge color="neutral">Disabled</Badge> : null}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setDraft(status); setEditing(status); }}>Edit</Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2.5 text-[12.5px] text-ink-muted">
            The dashboard asks for statuses by <em>meaning</em> — “being made”, “shipping”, “finished” — not by name.
            That is what lets you rename or replace stages without breaking any reports.
          </p>
        </CardBody>
      </Card>

      <Sheet
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        width="sm"
        title={editing ? "Edit status" : "New status"}
        footer={<>
          <Button variant="secondary" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </>}
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">{error}</p> : null}
          <Field label="Name" required>
            <Input value={draft.label ?? ""} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Ready to ship" />
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap gap-1.5">
              {STATUS_COLORS.map((color) => (
                <button key={color} type="button" onClick={() => setDraft({ ...draft, color })}
                  className={`rounded-full px-2.5 py-1 ${draft.color === color ? "ring-2 ring-brand" : ""}`}>
                  <Badge color={color} dot>{color}</Badge>
                </button>
              ))}
            </div>
          </Field>
          <Field label="What does this stage mean?" help={SEMANTICS.find((s) => s.value === (draft.semantic ?? "NONE"))?.help}>
            <Select value={draft.semantic ?? "NONE"} onChange={(e) => setDraft({ ...draft, semantic: e.target.value as Status["semantic"] })}>
              {SEMANTICS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <ToggleRow label="Counts as completed" description="Progress and delivery chips treat this as done."
            checked={!!draft.isCompleted} onChange={(v) => setDraft({ ...draft, isCompleted: v })} />
          <ToggleRow label="Default for new orders" checked={!!draft.isDefault} onChange={(v) => setDraft({ ...draft, isDefault: v })} />
          <ToggleRow label="Active" description="Disabled statuses stay on existing orders but can't be chosen."
            checked={draft.isActive ?? true} onChange={(v) => setDraft({ ...draft, isActive: v })} />
        </div>
      </Sheet>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        {description ? <p className="text-[12px] text-ink-subtle">{description}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
