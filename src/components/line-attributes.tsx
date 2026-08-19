"use client";
import { Select, Input } from "./ui/field";
import type { FieldDef } from "./custom-fields";
import { cn } from "@/lib/cn";

/**
 * The per-line attribute row: colour, material, country, size.
 *
 * Deliberately compact and inline rather than a nested form — these are chosen
 * on almost every line, so they have to cost a couple of taps, not a dialog.
 * Dropdowns render as chips because picking "Red" from six colours should not
 * require opening a select on a phone.
 */
export function LineAttributeFields({ defs, values, onChange }: {
  defs: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (defs.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {defs.map((def) => {
        const value = values[def.key];
        const options = def.options ?? [];

        // A short list of choices is faster as chips than as a dropdown.
        if (def.type === "SELECT" && options.length > 0 && options.length <= 8) {
          return (
            <div key={def.id} className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 text-[12px] font-medium text-ink-muted">
                {def.label}{def.isRequired ? <span className="text-red-600"> *</span> : null}
              </span>
              {options.map((option) => {
                const active = value === option.value;
                return (
                  <button
                    key={option.value} type="button"
                    onClick={() => onChange(def.key, active ? null : option.value)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 transition",
                      active
                        ? "bg-teal-50 text-teal-800 ring-teal-300"
                        : "bg-white text-ink-muted ring-line-strong hover:bg-stone-50",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          );
        }

        return (
          <div key={def.id} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[12px] font-medium text-ink-muted">
              {def.label}{def.isRequired ? <span className="text-red-600"> *</span> : null}
            </span>
            {def.type === "SELECT" ? (
              <Select value={(value as string) ?? ""} onChange={(e) => onChange(def.key, e.target.value)}
                className="h-8 max-w-[220px] text-[12.5px]">
                <option value="">Not set</option>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : def.type === "CHECKBOX" ? (
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" checked={!!value} onChange={(e) => onChange(def.key, e.target.checked)}
                  className="rounded accent-brand" />
                Yes
              </label>
            ) : (
              <Input
                type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"}
                value={(value as string) ?? ""}
                onChange={(e) => onChange(def.key, e.target.value)}
                placeholder={def.helpText ?? ""}
                className="h-8 max-w-[220px] text-[12.5px]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
