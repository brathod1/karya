"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { archiveCategoryAction, upsertCategoryAction, upsertPaymentMethodAction } from "@/server/actions/settings";

type Row = { id: string; name: string; isActive: boolean; parentId?: string | null };

/** Shared editor for the flat configuration lists: payment methods and categories. */
export function SimpleListEditor({ kind, title, description, rows, parents }: {
  kind: "method" | "PRODUCT" | "EXPENSE";
  title: string; description: string; rows: Row[];
  parents?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState("");
  const [parentId, setParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!adding.trim()) return;
    setBusy(true);
    const result = kind === "method"
      ? await upsertPaymentMethodAction({ label: adding.trim() })
      : await upsertCategoryAction({ kind, name: adding.trim(), parentId: parentId || null });
    setBusy(false);
    if (!result.ok) return toast.push(result.error, "error");
    setAdding(""); setParentId("");
    toast.push("Added");
    router.refresh();
  }

  async function rename(row: Row) {
    if (!editingName.trim() || editingName === row.name) { setEditingId(null); return; }
    setBusy(true);
    const result = kind === "method"
      ? await upsertPaymentMethodAction({ id: row.id, label: editingName.trim(), isActive: row.isActive })
      : await upsertCategoryAction({ id: row.id, kind, name: editingName.trim(), parentId: row.parentId ?? null });
    setBusy(false);
    setEditingId(null);
    if (!result.ok) return toast.push(result.error, "error");
    toast.push("Renamed");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              {editingId === row.id ? (
                <Input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => rename(row)} onKeyDown={(e) => { if (e.key === "Enter") rename(row); if (e.key === "Escape") setEditingId(null); }}
                  className="h-8 max-w-xs" />
              ) : (
                <button className="flex-1 text-left text-[13.5px] hover:underline"
                  onClick={() => { setEditingId(row.id); setEditingName(row.name); }}>
                  {row.name}
                  {row.parentId ? <span className="ml-2 text-[11.5px] text-ink-subtle">
                    in {parents?.find((p) => p.id === row.parentId)?.name}
                  </span> : null}
                </button>
              )}
              {!row.isActive ? <Badge color="neutral">Disabled</Badge> : null}
              {kind !== "method" ? (
                <Button variant="ghost" size="sm" disabled={busy}
                  onClick={async () => {
                    const result = await archiveCategoryAction(row.id);
                    if (result.ok) { toast.push("Archived — history keeps it"); router.refresh(); }
                    else toast.push(result.error, "error");
                  }}>
                  <Archive className="size-3.5" />Archive
                </Button>
              ) : (
                <Button variant="ghost" size="sm" disabled={busy}
                  onClick={async () => {
                    const result = await upsertPaymentMethodAction({ id: row.id, label: row.name, isActive: !row.isActive });
                    if (result.ok) { toast.push(row.isActive ? "Disabled" : "Enabled"); router.refresh(); }
                    else toast.push(result.error, "error");
                  }}>
                  {row.isActive ? "Disable" : "Enable"}
                </Button>
              )}
            </li>
          ))}
          {rows.length === 0 ? <li className="py-3 text-[13px] text-ink-subtle">Nothing here yet.</li> : null}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          <Input value={adding} onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add new…" className="h-9 max-w-xs" />
          {parents && parents.length > 0 ? (
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)} className="h-9 max-w-[200px]">
              <option value="">Top level</option>
              {parents.map((p) => <option key={p.id} value={p.id}>Inside {p.name}</option>)}
            </Select>
          ) : null}
          <Button size="sm" onClick={add} loading={busy}><Plus className="size-3.5" />Add</Button>
        </div>
      </CardBody>
    </Card>
  );
}
