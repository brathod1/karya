"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { deleteCustomFieldAction, upsertCustomFieldAction } from "@/server/actions/settings";

type Entity = "ORDER" | "ORDER_ITEM" | "CUSTOMER" | "PRODUCT" | "EXPENSE" | "EVENT";
type FieldRow = {
  id: string; entityType: string; key: string; label: string; type: string;
  helpText: string | null; isRequired: boolean; isActive: boolean; showInTable: boolean;
  options: { value: string; label: string }[];
};

const TYPES = [
  { value: "TEXT", label: "Text" }, { value: "TEXTAREA", label: "Long text" },
  { value: "NUMBER", label: "Number" }, { value: "CURRENCY", label: "Money" },
  { value: "DATE", label: "Date" }, { value: "SELECT", label: "Dropdown" },
  { value: "MULTI_SELECT", label: "Multi-select" }, { value: "CHECKBOX", label: "Yes / No" },
  { value: "URL", label: "Link" }, { value: "FILE", label: "File" },
];

const ENTITIES: Entity[] = ["ORDER", "ORDER_ITEM", "CUSTOMER", "PRODUCT", "EXPENSE", "EVENT"];

export function CustomFieldsEditor({ fields, terms }: { fields: FieldRow[]; terms: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FieldRow | null>(null);
  const [entityType, setEntityType] = useState<Entity>("ORDER");
  const [label, setLabel] = useState("");
  const [type, setType] = useState("TEXT");
  const [helpText, setHelpText] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [showInTable, setShowInTable] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew(entity: Entity) {
    setEditing(null); setEntityType(entity); setLabel(""); setType("TEXT");
    setHelpText(""); setIsRequired(false); setShowInTable(false); setOptionsText("");
    setError(null); setOpen(true);
  }

  function openEdit(field: FieldRow) {
    setEditing(field); setEntityType(field.entityType as Entity); setLabel(field.label);
    setType(field.type); setHelpText(field.helpText ?? ""); setIsRequired(field.isRequired);
    setShowInTable(field.showInTable); setOptionsText(field.options.map((o) => o.label).join("\n"));
    setError(null); setOpen(true);
  }

  async function save() {
    setError(null);
    setSaving(true);
    const options = ["SELECT", "MULTI_SELECT"].includes(type)
      ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
          .map((label) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label }))
      : undefined;

    const result = await upsertCustomFieldAction({
      id: editing?.id, entityType, label, type, helpText: helpText || null,
      options, isRequired, showInTable, isActive: true,
    });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    toast.push(editing ? "Field updated" : "Field added");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader
          title="Custom fields"
          description="Anything your business tracks that isn't built in — yarn type, flavour, paper GSM, whatever it is."
        />
        <CardBody className="space-y-5">
          {ENTITIES.map((entity) => {
            const rows = fields.filter((f) => f.entityType === entity && f.isActive);
            return (
              <div key={entity}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">
                      {entity === "ORDER_ITEM" ? "On each line of an order" : `On each ${terms[entity]?.toLowerCase() ?? entity.toLowerCase()}`}
                    </p>
                    {entity === "ORDER_ITEM" ? (
                      <p className="mt-0.5 text-[12px] text-ink-subtle">
                        What makes one of something different from another — colour, size, material, country.
                        Set these up and every line records them, so “Bandana” becomes “Bandana · Red · Cotton”.
                      </p>
                    ) : null}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openNew(entity)}><Plus className="size-3.5" />Add field</Button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[13px] text-ink-subtle">No extra fields.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
                    {rows.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                        <button className="text-[13.5px] font-medium hover:underline" onClick={() => openEdit(f)}>{f.label}</button>
                        <Badge color="slate">{TYPES.find((t) => t.value === f.type)?.label ?? f.type}</Badge>
                        {f.isRequired ? <Badge color="amber">Required</Badge> : null}
                        {f.showInTable ? <Badge color="teal">In table</Badge> : null}
                        <Button size="sm" variant="ghost" className="ml-auto"
                          onClick={async () => {
                            const result = await deleteCustomFieldAction(f.id);
                            if (result.ok) { toast.push("Field hidden — stored values are kept"); router.refresh(); }
                            else toast.push(result.error, "error");
                          }}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Sheet
        open={open} onClose={() => setOpen(false)} width="sm"
        title={editing ? "Edit field" : "New custom field"}
        description={`Appears on every ${terms[entityType]?.toLowerCase() ?? entityType.toLowerCase()}.`}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={saving}>Save field</Button></>}
      >
        <div className="space-y-4">
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">{error}</p> : null}
          <Field label="Applies to">
            <Select value={entityType} disabled={!!editing} onChange={(e) => setEntityType(e.target.value as Entity)}>
              {ENTITIES.map((e) => <option key={e} value={e}>{terms[e] ?? e}</option>)}
            </Select>
          </Field>
          <Field label="Field name" required><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Yarn type" /></Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          {["SELECT", "MULTI_SELECT"].includes(type) ? (
            <Field label="Options" help="One per line.">
              <textarea rows={5} value={optionsText} onChange={(e) => setOptionsText(e.target.value)}
                placeholder={"Cotton\nAcrylic\nWool"}
                className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line-strong focus:ring-2 focus:ring-brand focus:outline-none" />
            </Field>
          ) : null}
          <Field label="Help text" help="Shown under the field.">
            <Input value={helpText} onChange={(e) => setHelpText(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
            <p className="text-[13px] font-medium">Required</p>
            <Switch checked={isRequired} onChange={setIsRequired} label="Required" />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
            <div>
              <p className="text-[13px] font-medium">Show as a table column</p>
              <p className="text-[12px] text-ink-subtle">Available in the column picker on list screens.</p>
            </div>
            <Switch checked={showInTable} onChange={setShowInTable} label="Show in table" />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
