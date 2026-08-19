import "server-only";
import { eq } from "drizzle-orm";
import { db, type Exec } from "@/server/db";
import {
  categories, customFieldDefinitions, memberships, orgSettings, organizations,
  paymentMethods, statusDefinitions,
} from "@/server/db/schema";
import { DEFAULT_SETTINGS, orgSettingsSchema, type OrgSettingsData } from "@/lib/settings";
import { TEMPLATES, type TemplateKey } from "./templates";
import { ensureSequences } from "./numbering";
import { slugify } from "@/lib/format";

function mergeSettings(base: OrgSettingsData, override: Partial<OrgSettingsData>): OrgSettingsData {
  return orgSettingsSchema.parse({
    ...base,
    ...override,
    terminology: { ...base.terminology, ...(override.terminology ?? {}) },
    modules: { ...base.modules, ...(override.modules ?? {}) },
    formats: { ...base.formats, ...(override.formats ?? {}) },
    pricing: { ...base.pricing, ...(override.pricing ?? {}) },
    payments: { ...base.payments, ...(override.payments ?? {}) },
    events: { ...base.events, ...(override.events ?? {}) },
    orders: { ...base.orders, ...(override.orders ?? {}) },
    dashboard: { ...base.dashboard, ...(override.dashboard ?? {}) },
  });
}

/**
 * The ENTIRE implementation of business templates. It writes configuration rows
 * and nothing else — no template-specific behaviour exists anywhere else.
 */
export async function applyTemplate(tx: Exec, orgId: string, key: TemplateKey) {
  const template = TEMPLATES[key] ?? TEMPLATES.generic;
  const settings = mergeSettings(DEFAULT_SETTINGS, template.settings);

  await tx.insert(orgSettings).values({ orgId, data: settings as never })
    .onConflictDoUpdate({ target: orgSettings.orgId, set: { data: settings as never } });

  if (template.statuses.length) {
    await tx.insert(statusDefinitions).values(
      template.statuses.map((s, i) => ({
        orgId, kind: "ORDER" as const, key: s.key, label: s.label, color: s.color,
        sortOrder: i, isDefault: !!s.isDefault, isCompleted: !!s.isCompleted, semantic: s.semantic,
      })),
    ).onConflictDoNothing();
  }

  if (template.paymentMethods.length) {
    await tx.insert(paymentMethods).values(
      template.paymentMethods.map((m, i) => ({ orgId, key: m.key, label: m.label, sortOrder: i })),
    ).onConflictDoNothing();
  }

  const cats = [
    ...template.productCategories.map((name, i) => ({ orgId, kind: "PRODUCT" as const, name, sortOrder: i })),
    ...template.expenseCategories.map((name, i) => ({ orgId, kind: "EXPENSE" as const, name, sortOrder: i })),
  ];
  if (cats.length) await tx.insert(categories).values(cats).onConflictDoNothing();

  if (template.customFields?.length) {
    await tx.insert(customFieldDefinitions).values(
      template.customFields.map((f, i) => ({
        orgId, entityType: f.entityType, key: f.key, label: f.label, type: f.type,
        options: (f.options ?? null) as never, sortOrder: i, showInTable: !!f.showInTable,
      })),
    ).onConflictDoNothing();
  }

  await ensureSequences(tx, orgId);
  return settings;
}

export async function createOrganization(args: {
  userId: string; name: string; templateKey: TemplateKey; businessType?: string | null;
  currencyCode?: string; currencySymbol?: string; timezone?: string; locale?: string;
}) {
  return db.transaction(async (tx) => {
    const base = slugify(args.name);
    let slug = base;
    for (let i = 1; ; i++) {
      const [clash] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (!clash) break;
      slug = `${base}-${i}`;
    }

    const [org] = await tx.insert(organizations).values({
      name: args.name.trim(),
      slug,
      templateKey: args.templateKey,
      businessType: args.businessType ?? null,
      currencyCode: args.currencyCode ?? "INR",
      currencySymbol: args.currencySymbol ?? "₹",
      timezone: args.timezone ?? "Asia/Kolkata",
      locale: args.locale ?? "en-IN",
    }).returning();

    await tx.insert(memberships).values({ orgId: org.id, userId: args.userId, role: "OWNER", acceptedAt: new Date() });
    await applyTemplate(tx, org.id, args.templateKey);

    return org;
  });
}
