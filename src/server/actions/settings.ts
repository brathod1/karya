"use server";
import { revalidatePath } from "next/cache";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  categories, customFieldDefinitions, numberSequences, orgSettings, organizations,
  paymentMethods, statusDefinitions,
} from "@/server/db/schema";
import { requireCapability } from "@/server/context";
import { logAudit } from "@/server/domain/audit";
import { orgSettingsSchema } from "@/lib/settings";
import { keyify } from "@/lib/format";
import { fail } from "./result";

function revalidateAll() {
  for (const p of ["/dashboard", "/orders", "/customers", "/products", "/events", "/expenses", "/payments", "/analytics", "/settings"]) {
    revalidatePath(p, "layout");
  }
}

/** Deep-merges a partial settings patch over the stored value, then validates. */
export async function updateSettingsAction(patch: unknown) {
  try {
    const ctx = await requireCapability("config:manage");
    const [row] = await db.select().from(orgSettings).where(eq(orgSettings.orgId, ctx.org.id)).limit(1);
    const current = orgSettingsSchema.parse(row?.data ?? {});
    const incoming = (patch ?? {}) as Record<string, Record<string, unknown>>;

    const merged: Record<string, unknown> = { ...current };
    for (const [group, values] of Object.entries(incoming)) {
      const existing = (current as unknown as Record<string, unknown>)[group];
      merged[group] = values && typeof values === "object" && !Array.isArray(values) && existing && typeof existing === "object"
        ? { ...(existing as object), ...values }
        : values;
    }

    const next = orgSettingsSchema.parse(merged);
    await db.insert(orgSettings).values({ orgId: ctx.org.id, data: next as never })
      .onConflictDoUpdate({ target: orgSettings.orgId, set: { data: next as never, updatedAt: new Date() } });
    await logAudit(db, { orgId: ctx.org.id, actor: ctx.actor, action: "settings.update", entityType: "OrgSettings", entityId: ctx.org.id, after: incoming });

    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function updateBusinessProfileAction(input: unknown) {
  try {
    const ctx = await requireCapability("config:manage");
    const parsed = z.object({
      name: z.string().min(1, "Business name is required"),
      logoUrl: z.string().nullable().optional(),
      currencyCode: z.string().length(3),
      currencySymbol: z.string().min(1).max(4),
      timezone: z.string().min(1),
      locale: z.string().min(2),
    }).parse(input);

    await db.update(organizations).set(parsed).where(eq(organizations.id, ctx.org.id));
    await logAudit(db, { orgId: ctx.org.id, actor: ctx.actor, action: "org.update", entityType: "Organization", entityId: ctx.org.id, after: parsed });
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

// ───────── statuses

const statusSchema = z.object({
  label: z.string().min(1, "Give the status a name"),
  color: z.string().min(1),
  isCompleted: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  semantic: z.enum(["NONE", "PRODUCTION", "SHIPMENT", "COMPLETION", "CANCELLED"]),
  isActive: z.boolean().optional(),
});

export async function createStatusAction(input: unknown) {
  try {
    const ctx = await requireCapability("config:manage");
    const parsed = statusSchema.parse(input);
    const [{ value: maxSort }] = await db.select({ value: max(statusDefinitions.sortOrder) }).from(statusDefinitions)
      .where(and(eq(statusDefinitions.orgId, ctx.org.id), eq(statusDefinitions.kind, "ORDER")));

    let key = keyify(parsed.label);
    const taken = ctx.config.orderStatuses.map((s) => s.key);
    if (taken.includes(key)) key = `${key}_${Date.now().toString(36).slice(-4)}`;

    await db.transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx.update(statusDefinitions).set({ isDefault: false })
          .where(and(eq(statusDefinitions.orgId, ctx.org.id), eq(statusDefinitions.kind, "ORDER")));
      }
      await tx.insert(statusDefinitions).values({
        orgId: ctx.org.id, kind: "ORDER", key, label: parsed.label, color: parsed.color,
        isCompleted: !!parsed.isCompleted, isDefault: !!parsed.isDefault,
        semantic: parsed.semantic, sortOrder: (maxSort ?? 0) + 1,
      });
    });
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function updateStatusAction(id: string, input: unknown) {
  try {
    const ctx = await requireCapability("config:manage");
    const parsed = statusSchema.partial().parse(input);
    await db.transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx.update(statusDefinitions).set({ isDefault: false })
          .where(and(eq(statusDefinitions.orgId, ctx.org.id), eq(statusDefinitions.kind, "ORDER")));
      }
      // The `key` is intentionally never updated — history references it.
      await tx.update(statusDefinitions).set(parsed)
        .where(and(eq(statusDefinitions.orgId, ctx.org.id), eq(statusDefinitions.id, id)));
    });
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function reorderStatusesAction(ids: string[]) {
  try {
    const ctx = await requireCapability("config:manage");
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.update(statusDefinitions).set({ sortOrder: index })
          .where(and(eq(statusDefinitions.orgId, ctx.org.id), eq(statusDefinitions.id, id)));
      }
    });
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

// ───────── payment methods

export async function upsertPaymentMethodAction(input: unknown) {
  try {
    const ctx = await requireCapability("config:manage");
    const parsed = z.object({
      id: z.string().uuid().optional(),
      label: z.string().min(1, "Give the method a name"),
      isActive: z.boolean().optional(),
    }).parse(input);

    if (parsed.id) {
      await db.update(paymentMethods).set({ label: parsed.label, isActive: parsed.isActive ?? true })
        .where(and(eq(paymentMethods.orgId, ctx.org.id), eq(paymentMethods.id, parsed.id)));
    } else {
      const [{ value: maxSort }] = await db.select({ value: max(paymentMethods.sortOrder) }).from(paymentMethods)
        .where(eq(paymentMethods.orgId, ctx.org.id));
      let key = keyify(parsed.label);
      if (ctx.config.paymentMethods.some((m) => m.key === key)) key = `${key}_${Date.now().toString(36).slice(-4)}`;
      await db.insert(paymentMethods).values({ orgId: ctx.org.id, key, label: parsed.label, sortOrder: (maxSort ?? 0) + 1 });
    }
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

// ───────── categories

export async function upsertCategoryAction(input: unknown) {
  try {
    const ctx = await requireCapability("config:manage");
    const parsed = z.object({
      id: z.string().uuid().optional(),
      kind: z.enum(["PRODUCT", "EXPENSE"]),
      name: z.string().min(1, "Give the category a name"),
      parentId: z.string().uuid().nullable().optional(),
    }).parse(input);

    if (parsed.id) {
      if (parsed.parentId === parsed.id) throw new Error("A category cannot be its own parent.");
      await db.update(categories).set({ name: parsed.name, parentId: parsed.parentId ?? null })
        .where(and(eq(categories.orgId, ctx.org.id), eq(categories.id, parsed.id)));
    } else {
      const [{ value: maxSort }] = await db.select({ value: max(categories.sortOrder) }).from(categories)
        .where(and(eq(categories.orgId, ctx.org.id), eq(categories.kind, parsed.kind)));
      await db.insert(categories).values({
        orgId: ctx.org.id, kind: parsed.kind, name: parsed.name,
        parentId: parsed.parentId ?? null, sortOrder: (maxSort ?? 0) + 1,
      });
    }
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

/**
 * Creating a category from inside a product or expense form.
 *
 * Renaming, re-parenting and archiving categories stay an admin act, but
 * *adding* one is additive and harmless — and being sent to Settings mid-form
 * to add "Tops" is exactly the kind of interruption that makes people give up
 * and leave the field blank. So this is permitted by whoever may manage the
 * record they are creating.
 */
export async function createCategoryInlineAction(kind: unknown, name: unknown) {
  try {
    const parsed = z.object({
      kind: z.enum(["PRODUCT", "EXPENSE"]),
      name: z.string().min(1, "Give the category a name").max(60),
    }).parse({ kind, name });

    const ctx = await requireCapability(parsed.kind === "PRODUCT" ? "product:manage" : "expense:manage");
    const trimmed = parsed.name.trim();

    // Re-use an existing category rather than creating a near-duplicate.
    const existing = (parsed.kind === "PRODUCT" ? ctx.config.productCategories : ctx.config.expenseCategories)
      .find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return { ok: true as const, data: { id: existing.id, name: existing.name, reused: true } };

    const [{ value: maxSort }] = await db.select({ value: max(categories.sortOrder) }).from(categories)
      .where(and(eq(categories.orgId, ctx.org.id), eq(categories.kind, parsed.kind)));

    const [row] = await db.insert(categories).values({
      orgId: ctx.org.id, kind: parsed.kind, name: trimmed, sortOrder: (maxSort ?? 0) + 1,
    }).returning();

    await logAudit(db, {
      orgId: ctx.org.id, actor: ctx.actor, action: "category.create",
      entityType: "Category", entityId: row.id, after: { kind: parsed.kind, name: row.name },
    });

    revalidateAll();
    return { ok: true as const, data: { id: row.id, name: row.name, reused: false } };
  } catch (error) { return fail(error); }
}

export async function archiveCategoryAction(id: string) {
  try {
    const ctx = await requireCapability("config:manage");
    // Archived, never deleted: historical products and expenses keep their category.
    await db.update(categories).set({ archivedAt: new Date() })
      .where(and(eq(categories.orgId, ctx.org.id), eq(categories.id, id)));
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

// ───────── custom fields

export async function upsertCustomFieldAction(input: unknown) {
  try {
    const ctx = await requireCapability("config:manage");
    const parsed = z.object({
      id: z.string().uuid().optional(),
      entityType: z.enum(["ORDER", "ORDER_ITEM", "CUSTOMER", "PRODUCT", "EXPENSE", "EVENT"]),
      label: z.string().min(1, "Give the field a name"),
      type: z.enum(["TEXT", "TEXTAREA", "NUMBER", "CURRENCY", "DATE", "SELECT", "MULTI_SELECT", "CHECKBOX", "URL", "FILE"]),
      helpText: z.string().nullable().optional(),
      options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
      isRequired: z.boolean().optional(),
      showInTable: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }).parse(input);

    if (parsed.id) {
      await db.update(customFieldDefinitions).set({
        label: parsed.label, type: parsed.type, helpText: parsed.helpText ?? null,
        options: (parsed.options ?? null) as never,
        isRequired: parsed.isRequired ?? false, showInTable: parsed.showInTable ?? false,
        isActive: parsed.isActive ?? true,
      }).where(and(eq(customFieldDefinitions.orgId, ctx.org.id), eq(customFieldDefinitions.id, parsed.id)));
    } else {
      const [{ value: maxSort }] = await db.select({ value: max(customFieldDefinitions.sortOrder) }).from(customFieldDefinitions)
        .where(and(eq(customFieldDefinitions.orgId, ctx.org.id), eq(customFieldDefinitions.entityType, parsed.entityType)));
      let key = keyify(parsed.label);
      const taken = ctx.config.fieldDefs.filter((f) => f.entityType === parsed.entityType).map((f) => f.key);
      if (taken.includes(key)) key = `${key}_${Date.now().toString(36).slice(-4)}`;
      await db.insert(customFieldDefinitions).values({
        orgId: ctx.org.id, entityType: parsed.entityType, key, label: parsed.label, type: parsed.type,
        helpText: parsed.helpText ?? null, options: (parsed.options ?? null) as never,
        isRequired: parsed.isRequired ?? false, showInTable: parsed.showInTable ?? false,
        sortOrder: (maxSort ?? 0) + 1,
      });
    }
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function deleteCustomFieldAction(id: string) {
  try {
    const ctx = await requireCapability("config:manage");
    // Deactivate rather than delete: stored values stay readable in history.
    await db.update(customFieldDefinitions).set({ isActive: false })
      .where(and(eq(customFieldDefinitions.orgId, ctx.org.id), eq(customFieldDefinitions.id, id)));
    revalidateAll();
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

// ───────── numbering

export async function updateSequenceAction(input: unknown) {
  try {
    const ctx = await requireCapability("config:manage");
    const parsed = z.object({
      entityType: z.string(),
      prefix: z.string().min(1).max(8),
      pattern: z.string().min(1),
      nextValue: z.coerce.number().int().positive(),
      resetPolicy: z.enum(["NEVER", "YEARLY", "MONTHLY"]),
    }).parse(input);

    await db.update(numberSequences).set({
      prefix: parsed.prefix, pattern: parsed.pattern, nextValue: parsed.nextValue, resetPolicy: parsed.resetPolicy,
    }).where(and(eq(numberSequences.orgId, ctx.org.id), eq(numberSequences.entityType, parsed.entityType)));

    revalidatePath("/settings/numbering");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}
