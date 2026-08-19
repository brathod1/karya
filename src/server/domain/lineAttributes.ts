import type { CustomFieldDefinition } from "@/server/db/schema";
import { fieldSchema } from "./customFields";

/**
 * Order-line attributes — the difference between "Bandana" and "the red cotton
 * one", or between "Flag" and "France".
 *
 * Kept as a snapshot on the line rather than as separate products, so that one
 * catalogue entry does not fan out into hundreds, and so that reporting still
 * rolls up to "Bandanas: 34 sold" while production can still be told exactly
 * which ones.
 */
export type LineAttributes = Record<string, string | number | boolean | string[] | null>;

export function lineAttributeDefs(defs: CustomFieldDefinition[]): CustomFieldDefinition[] {
  return defs.filter((d) => d.entityType === "ORDER_ITEM" && d.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The minimum needed to *render* an attribute, as opposed to validating one.
 * Display happens in client components, which must not depend on the full
 * database row type.
 */
export type AttributeDef = {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[] | null;
};

export type ParseResult =
  | { ok: true; attributes: LineAttributes | null }
  | { ok: false; error: string };

export function parseLineAttributes(defs: CustomFieldDefinition[], input: unknown): ParseResult {
  const active = lineAttributeDefs(defs);
  if (active.length === 0) return { ok: true, attributes: null };

  const raw = (input ?? {}) as Record<string, unknown>;
  const out: LineAttributes = {};

  for (const def of active) {
    const value = raw[def.key];
    const empty = value === undefined || value === null || value === "" ||
      (Array.isArray(value) && value.length === 0);

    if (empty) {
      if (def.isRequired) return { ok: false, error: `${def.label} is required on every line.` };
      continue;
    }

    const parsed = fieldSchema(def).safeParse(value);
    if (!parsed.success) {
      return { ok: false, error: `${def.label}: ${parsed.error.issues[0]?.message ?? "invalid"}` };
    }
    out[def.key] = parsed.data as LineAttributes[string];
  }

  return { ok: true, attributes: Object.keys(out).length > 0 ? out : null };
}

/** "Red · Cotton" — what shows beside the product name in lists. */
export function formatLineAttributes(defs: AttributeDef[], attributes: unknown): string {
  if (!attributes || typeof attributes !== "object") return "";
  const values = attributes as LineAttributes;

  return defs
    .map((def) => {
      const value = values[def.key];
      if (value === undefined || value === null || value === "") return null;

      const options = def.options ?? [];
      if (def.type === "SELECT") {
        return options.find((o) => o.value === value)?.label ?? String(value);
      }
      if (def.type === "MULTI_SELECT" && Array.isArray(value)) {
        return value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ");
      }
      if (def.type === "CHECKBOX") return value ? def.label : null;
      return String(value);
    })
    .filter(Boolean)
    .join(" · ");
}

/**
 * A stable key for grouping identical work together, so "7 red cotton bandanas"
 * aggregates across however many separate orders asked for them.
 */
export function attributeSignature(productName: string, attributes: unknown): string {
  if (!attributes || typeof attributes !== "object") return productName;
  const values = attributes as LineAttributes;
  const parts = Object.keys(values).sort()
    .map((key) => `${key}=${Array.isArray(values[key]) ? (values[key] as string[]).join(",") : String(values[key])}`);
  return parts.length > 0 ? `${productName}|${parts.join("|")}` : productName;
}
