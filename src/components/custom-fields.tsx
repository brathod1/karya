"use client";
import { Field, Input, Select, Textarea } from "./ui/field";
import { MoneyInput } from "./money-input";

export type FieldDef = {
  id: string; key: string; label: string; type: string;
  helpText: string | null; isRequired: boolean;
  options: { value: string; label: string }[] | null;
};

/**
 * One generic renderer for every custom field type. Adding a field in Settings
 * makes it appear here with no code change — which is the whole point.
 */
export function CustomFields({ defs, values, onChange, errors }: {
  defs: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
}) {
  if (defs.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {defs.map((def) => {
        const value = values[def.key];
        const error = errors?.[def.key];
        const common = { label: def.label, required: def.isRequired, help: def.helpText ?? undefined, error };

        switch (def.type) {
          case "TEXTAREA":
            return (
              <Field key={def.id} {...common} className="sm:col-span-2">
                <Textarea value={(value as string) ?? ""} onChange={(e) => onChange(def.key, e.target.value)} />
              </Field>
            );
          case "NUMBER":
            return (
              <Field key={def.id} {...common}>
                <Input type="number" step="any" value={(value as string) ?? ""} onChange={(e) => onChange(def.key, e.target.value)} />
              </Field>
            );
          case "CURRENCY":
            return (
              <Field key={def.id} {...common}>
                <MoneyInput valueMinor={(value as number) ?? 0} onChange={(m) => onChange(def.key, m)} />
              </Field>
            );
          case "DATE":
            return (
              <Field key={def.id} {...common}>
                <Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(def.key, e.target.value)} />
              </Field>
            );
          case "CHECKBOX":
            return (
              <Field key={def.id} {...common}>
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!value} onChange={(e) => onChange(def.key, e.target.checked)}
                    className="rounded accent-brand" />
                  Yes
                </label>
              </Field>
            );
          case "SELECT":
            return (
              <Field key={def.id} {...common}>
                <Select value={(value as string) ?? ""} onChange={(e) => onChange(def.key, e.target.value)}>
                  <option value="">Not set</option>
                  {(def.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            );
          case "MULTI_SELECT": {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            return (
              <Field key={def.id} {...common} className="sm:col-span-2">
                <div className="flex flex-wrap gap-1.5">
                  {(def.options ?? []).map((o) => {
                    const on = selected.includes(o.value);
                    return (
                      <button
                        key={o.value} type="button"
                        onClick={() => onChange(def.key, on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                        className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ring-1 transition ${
                          on ? "bg-teal-50 text-teal-800 ring-teal-300" : "bg-white text-ink-muted ring-line-strong hover:bg-stone-50"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            );
          }
          case "URL":
            return (
              <Field key={def.id} {...common}>
                <Input type="url" placeholder="https://" value={(value as string) ?? ""} onChange={(e) => onChange(def.key, e.target.value)} />
              </Field>
            );
          default:
            return (
              <Field key={def.id} {...common}>
                <Input value={(value as string) ?? ""} onChange={(e) => onChange(def.key, e.target.value)} />
              </Field>
            );
        }
      })}
    </div>
  );
}
