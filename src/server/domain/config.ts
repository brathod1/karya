import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  categories, customFieldDefinitions, orgSettings, organizations, paymentMethods, statusDefinitions,
  type Category, type CustomFieldDefinition, type Organization, type PaymentMethod, type StatusDefinition,
} from "@/server/db/schema";
import { formatMinor } from "@/lib/money";
import { makeTerm, parseSettings, type OrgSettingsData, type TermKey } from "@/lib/settings";
import type { ClientConfig } from "@/lib/client-config";

export type { ClientConfig };

/**
 * One object that describes everything configurable about an organisation.
 * Resolved once per request (React `cache`) and handed to every page.
 */
export type OrgConfig = {
  org: Organization;
  settings: OrgSettingsData;
  statuses: StatusDefinition[];
  orderStatuses: StatusDefinition[];
  paymentMethods: PaymentMethod[];
  productCategories: Category[];
  expenseCategories: Category[];
  fieldDefs: CustomFieldDefinition[];
  t: (key: TermKey, form?: "one" | "many") => string;
  money: (minor: number) => string;
  dateFormat: string;
};

/**
 * Everything configurable about an organisation, in one parallel wave.
 *
 * `known` is the organisation row the caller already loaded — the session
 * lookup fetches it anyway, so re-reading it here was a wasted round trip.
 */
export const getOrgConfig = cache(async (orgId: string, known?: Organization): Promise<OrgConfig> => {
  const [orgRows, settingsRows, statuses, methods, cats, fieldDefs] = await Promise.all([
    known ? Promise.resolve([known]) : db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1),
    db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1),
    db.select().from(statusDefinitions).where(eq(statusDefinitions.orgId, orgId)).orderBy(asc(statusDefinitions.sortOrder)),
    db.select().from(paymentMethods).where(eq(paymentMethods.orgId, orgId)).orderBy(asc(paymentMethods.sortOrder)),
    db.select().from(categories).where(eq(categories.orgId, orgId)).orderBy(asc(categories.sortOrder)),
    db.select().from(customFieldDefinitions).where(eq(customFieldDefinitions.orgId, orgId)).orderBy(asc(customFieldDefinitions.sortOrder)),
  ]);

  const org = orgRows[0];
  if (!org) {
    const err = new Error("Workspace not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  return buildConfig(org, parseSettings(settingsRows[0]?.data), statuses, methods, cats, fieldDefs);
});

export function buildConfig(
  org: Organization,
  settings: OrgSettingsData,
  statuses: StatusDefinition[],
  methods: PaymentMethod[],
  cats: Category[],
  fieldDefs: CustomFieldDefinition[],
): OrgConfig {
  return {
    org,
    settings,
    statuses,
    orderStatuses: statuses.filter((s) => s.kind === "ORDER"),
    paymentMethods: methods,
    productCategories: cats.filter((c) => c.kind === "PRODUCT" && !c.archivedAt),
    expenseCategories: cats.filter((c) => c.kind === "EXPENSE" && !c.archivedAt),
    fieldDefs,
    t: makeTerm(settings),
    money: (minor: number) =>
      formatMinor(minor, {
        symbol: org.currencySymbol,
        locale: settings.formats.numberLocale || org.locale,
        position: settings.formats.currencyPosition,
      }),
    dateFormat: settings.formats.dateFormat,
  };
}

export function toClientConfig(config: OrgConfig, role: string): ClientConfig {
  return {
    orgName: config.org.name,
    logoUrl: config.org.logoUrl,
    currencySymbol: config.org.currencySymbol,
    currencyCode: config.org.currencyCode,
    locale: config.settings.formats.numberLocale || config.org.locale,
    dateFormat: config.settings.formats.dateFormat,
    currencyPosition: config.settings.formats.currencyPosition,
    terminology: config.settings.terminology,
    modules: config.settings.modules,
    pricing: config.settings.pricing,
    orders: config.settings.orders,
    events: config.settings.events,
    role,
  };
}

export function defaultOrderStatus(config: OrgConfig): StatusDefinition {
  return (
    config.orderStatuses.find((s) => s.isDefault && s.isActive) ??
    config.orderStatuses.find((s) => s.isActive) ??
    config.orderStatuses[0]
  );
}

export function statusesBySemantic(config: OrgConfig, semantic: StatusDefinition["semantic"]) {
  return config.orderStatuses.filter((s) => s.semantic === semantic);
}

export function completedStatusIds(config: OrgConfig): string[] {
  return config.orderStatuses.filter((s) => s.isCompleted).map((s) => s.id);
}

export function openStatusIds(config: OrgConfig): string[] {
  return config.orderStatuses.filter((s) => !s.isCompleted && s.semantic !== "CANCELLED").map((s) => s.id);
}
