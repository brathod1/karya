import { z } from "zod";

/**
 * Every business-specific behaviour lives here or in a configuration table.
 * Reads always merge stored JSON over these defaults, so an organisation
 * created before a setting existed keeps working — new keys resolve to defaults.
 */

const term = z.object({ one: z.string(), many: z.string() });

export const MODULE_KEYS = [
  "orders", "customers", "products", "payments", "expenses", "events", "analytics",
  "inventory", "suppliers", "invoices", "delivery", "staff",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const WIDGET_KEYS = [
  "today", "needsAttention", "productionProgress", "topProducts",
  "expenses", "revenueChart", "outstanding", "recentActivity", "profit",
] as const;
export type WidgetKey = (typeof WIDGET_KEYS)[number];

export const orgSettingsSchema = z.object({
  terminology: z.object({
    customer: term.default({ one: "Customer", many: "Customers" }),
    product: term.default({ one: "Product", many: "Products" }),
    order: term.default({ one: "Order", many: "Orders" }),
    event: term.default({ one: "Event", many: "Events" }),
    expense: term.default({ one: "Expense", many: "Expenses" }),
    payment: term.default({ one: "Payment", many: "Payments" }),
  }).default({}),

  modules: z.object({
    orders: z.boolean().default(true),
    customers: z.boolean().default(true),
    products: z.boolean().default(true),
    payments: z.boolean().default(true),
    expenses: z.boolean().default(true),
    events: z.boolean().default(true),
    analytics: z.boolean().default(true),
    inventory: z.boolean().default(false),
    suppliers: z.boolean().default(false),
    invoices: z.boolean().default(false),
    delivery: z.boolean().default(false),
    staff: z.boolean().default(false),
  }).default({}),

  formats: z.object({
    dateFormat: z.string().default("dd MMM yyyy"),
    numberLocale: z.string().default("en-IN"),
    currencyPosition: z.enum(["before", "after"]).default("before"),
    weekStartsOn: z.number().min(0).max(6).default(1),
  }).default({}),

  pricing: z.object({
    enableCustomerSpecificPricing: z.boolean().default(true),
    enableDiscounts: z.boolean().default(true),
    enableAdditionalCharges: z.boolean().default(false),
    enableTax: z.boolean().default(false),
    taxRatePercent: z.number().min(0).max(100).default(0),
    taxInclusive: z.boolean().default(false),
    enableCostTracking: z.boolean().default(false),
  }).default({}),

  payments: z.object({
    /** What happens when a payment exceeds the outstanding balance. */
    overpaymentPolicy: z.enum(["REJECT", "CREDIT", "FLAG"]).default("FLAG"),
    autoAdvanceStatusOnFullPayment: z.boolean().default(false),
  }).default({}),

  events: z.object({
    allowOverproduction: z.boolean().default(false),
    completeThresholdPct: z.number().min(1).max(100).default(100),
  }).default({}),

  orders: z.object({
    requireCustomer: z.boolean().default(true),
    requireDeliveryDate: z.boolean().default(false),
    defaultDeliveryLeadDays: z.number().min(0).max(365).default(7),
    dueSoonDays: z.number().min(0).max(60).default(2),
  }).default({}),

  dashboard: z.object({
    widgets: z.array(z.object({
      key: z.enum(WIDGET_KEYS),
      enabled: z.boolean().default(true),
      order: z.number().default(0),
      range: z.string().optional(),
    })).default([
      { key: "today", enabled: true, order: 1, range: "today" },
      { key: "needsAttention", enabled: true, order: 2 },
      { key: "productionProgress", enabled: true, order: 3 },
      { key: "revenueChart", enabled: true, order: 4, range: "6months" },
      { key: "topProducts", enabled: true, order: 5, range: "month" },
      { key: "expenses", enabled: true, order: 6, range: "month" },
      { key: "outstanding", enabled: true, order: 7 },
      { key: "recentActivity", enabled: true, order: 8 },
      { key: "profit", enabled: false, order: 9, range: "month" },
    ]),
  }).default({}),

  /** Per-entity policy for BUILT-IN fields. Custom fields are configured as rows. */
  fields: z.record(z.string(), z.record(z.string(), z.object({
    enabled: z.boolean().default(true),
    required: z.boolean().default(false),
    label: z.string().optional(),
    helpText: z.string().optional(),
    order: z.number().optional(),
  }))).default({}),
});

export type OrgSettingsData = z.infer<typeof orgSettingsSchema>;

export const DEFAULT_SETTINGS: OrgSettingsData = orgSettingsSchema.parse({});

export function parseSettings(raw: unknown): OrgSettingsData {
  const result = orgSettingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : DEFAULT_SETTINGS;
}

export type TermKey = keyof OrgSettingsData["terminology"];

export function makeTerm(settings: OrgSettingsData) {
  return function t(key: TermKey, form: "one" | "many" = "one"): string {
    return settings.terminology[key]?.[form] ?? DEFAULT_SETTINGS.terminology[key][form];
  };
}

/** Built-in field metadata used by the field-configuration screen. */
export const BUILTIN_FIELDS: Record<string, { key: string; label: string; lockedEnabled?: boolean }[]> = {
  customer: [
    { key: "name", label: "Name", lockedEnabled: true },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address" },
    { key: "notes", label: "Notes" },
    { key: "tags", label: "Tags" },
  ],
  order: [
    { key: "customer", label: "Customer" },
    { key: "orderDate", label: "Order date", lockedEnabled: true },
    { key: "deliveryByDate", label: "Delivery by date" },
    { key: "deliveryTime", label: "Delivery time" },
    { key: "requestedDate", label: "Customer requested date" },
    { key: "internalDeadline", label: "Internal deadline" },
    { key: "note", label: "Order note" },
    { key: "internalNote", label: "Internal note" },
    { key: "customerNote", label: "Customer-facing note" },
  ],
  product: [
    { key: "name", label: "Name", lockedEnabled: true },
    { key: "description", label: "Description" },
    { key: "category", label: "Category" },
    { key: "unit", label: "Unit" },
    { key: "costMinor", label: "Cost" },
    { key: "imageUrl", label: "Image" },
  ],
  expense: [
    { key: "date", label: "Date", lockedEnabled: true },
    { key: "description", label: "Description", lockedEnabled: true },
    { key: "category", label: "Category" },
    { key: "method", label: "Payment method" },
    { key: "vendor", label: "Vendor" },
    { key: "notes", label: "Notes" },
  ],
};
