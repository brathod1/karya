import { z } from "zod";
import type { CustomFieldDefinition } from "@/server/db/schema";
import { toMinor } from "@/lib/money";

/**
 * Custom fields are validated against their DEFINITIONS, not against a static
 * schema. The definition is the schema — which is what allows a business owner
 * to add a field from Settings without a code change.
 */
export type FieldValue = string | number | boolean | string[] | null;

export function fieldSchema(def: CustomFieldDefinition): z.ZodTypeAny {
  const required = def.isRequired;
  switch (def.type) {
    case "NUMBER":
    case "CURRENCY": {
      const base = z.coerce.number().finite();
      return required ? base : base.nullish();
    }
    case "CHECKBOX":
      return z.coerce.boolean().nullish();
    case "DATE": {
      const base = z.string().min(1);
      return required ? base : base.nullish();
    }
    case "MULTI_SELECT": {
      const values = optionValues(def);
      const arr = z.array(z.string()).refine((a) => a.every((v) => values.includes(v)), "Unknown option selected");
      return required ? z.array(z.string()).min(1, `${def.label} is required`).refine((a) => a.every((v) => values.includes(v)), "Unknown option selected") : arr.nullish();
    }
    case "SELECT": {
      const values = optionValues(def);
      const base = z.string().refine((v) => values.includes(v), "Unknown option selected");
      return required ? base : base.nullish();
    }
    case "URL": {
      const base = z.string().url("Enter a valid link");
      return required ? base : base.or(z.literal("")).nullish();
    }
    default: {
      const base = z.string();
      return required ? base.min(1, `${def.label} is required`) : base.nullish();
    }
  }
}

export function optionValues(def: CustomFieldDefinition): string[] {
  const raw = def.options as { value: string }[] | null;
  return Array.isArray(raw) ? raw.map((o) => o.value) : [];
}

export function optionList(def: CustomFieldDefinition): { value: string; label: string }[] {
  const raw = def.options as { value: string; label: string }[] | null;
  return Array.isArray(raw) ? raw : [];
}

export type CustomFieldParseResult =
  | { ok: true; values: { definitionId: string; value: FieldValue }[] }
  | { ok: false; errors: Record<string, string> };

/** Parses a flat `{ [key]: rawValue }` map coming from a form. */
export function parseCustomFields(
  defs: CustomFieldDefinition[],
  input: Record<string, unknown>,
): CustomFieldParseResult {
  const errors: Record<string, string> = {};
  const values: { definitionId: string; value: FieldValue }[] = [];

  for (const def of defs) {
    if (!def.isActive) continue;
    const raw = input[def.key];
    const empty = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);

    if (empty) {
      if (def.isRequired) errors[def.key] = `${def.label} is required`;
      else values.push({ definitionId: def.id, value: null });
      continue;
    }

    const parsed = fieldSchema(def).safeParse(raw);
    if (!parsed.success) {
      errors[def.key] = parsed.error.issues[0]?.message ?? `${def.label} is invalid`;
      continue;
    }

    let value = parsed.data as FieldValue;
    if (def.type === "CURRENCY" && typeof value === "number") value = toMinor(value);
    values.push({ definitionId: def.id, value });
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values };
}

export function displayCustomValue(def: CustomFieldDefinition, value: unknown, money: (m: number) => string): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (def.type) {
    case "CURRENCY": return money(Number(value));
    case "CHECKBOX": return value ? "Yes" : "No";
    case "MULTI_SELECT": {
      const opts = optionList(def);
      return (value as string[]).map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ");
    }
    case "SELECT": {
      const opts = optionList(def);
      return opts.find((o) => o.value === value)?.label ?? String(value);
    }
    default: return String(value);
  }
}
