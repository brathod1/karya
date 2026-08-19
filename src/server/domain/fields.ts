import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { Exec } from "@/server/db";
import { customFieldDefinitions, customFieldValues, type CustomFieldDefinition } from "@/server/db/schema";
import { parseCustomFields, type FieldValue } from "./customFields";

type EntityType = "ORDER" | "ORDER_ITEM" | "CUSTOMER" | "PRODUCT" | "EXPENSE" | "EVENT";

export async function loadFieldDefs(tx: Exec, orgId: string, entityType: EntityType): Promise<CustomFieldDefinition[]> {
  return tx
    .select()
    .from(customFieldDefinitions)
    .where(and(eq(customFieldDefinitions.orgId, orgId), eq(customFieldDefinitions.entityType, entityType)));
}

export async function saveCustomFieldValues(
  tx: Exec, orgId: string, entityType: EntityType, entityId: string,
  defs: CustomFieldDefinition[], input: Record<string, unknown>,
) {
  const parsed = parseCustomFields(defs, input);
  if (!parsed.ok) {
    const err = new Error(Object.values(parsed.errors)[0] ?? "Invalid custom field") as Error & { fieldErrors?: Record<string, string> };
    err.fieldErrors = parsed.errors;
    throw err;
  }
  for (const v of parsed.values) {
    await tx
      .insert(customFieldValues)
      .values({ orgId, definitionId: v.definitionId, entityType, entityId, value: v.value as never })
      .onConflictDoUpdate({
        target: [customFieldValues.definitionId, customFieldValues.entityId],
        set: { value: v.value as never },
      });
  }
}

export async function loadCustomFieldValues(
  tx: Exec, orgId: string, entityType: EntityType, entityIds: string[],
): Promise<Map<string, Record<string, FieldValue>>> {
  const out = new Map<string, Record<string, FieldValue>>();
  if (entityIds.length === 0) return out;

  const rows = await tx
    .select({ value: customFieldValues, def: customFieldDefinitions })
    .from(customFieldValues)
    .innerJoin(customFieldDefinitions, eq(customFieldValues.definitionId, customFieldDefinitions.id))
    .where(and(
      eq(customFieldValues.orgId, orgId),
      eq(customFieldValues.entityType, entityType),
      inArray(customFieldValues.entityId, entityIds),
    ));

  for (const row of rows) {
    const bucket = out.get(row.value.entityId) ?? {};
    bucket[row.def.key] = row.value.value as FieldValue;
    out.set(row.value.entityId, bucket);
  }
  return out;
}
