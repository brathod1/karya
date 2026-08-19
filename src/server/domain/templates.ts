import "server-only";
import type { OrgSettingsData } from "@/lib/settings";

/**
 * A template is ONLY a starting set of configuration rows.
 * `applyTemplate` is its entire implementation — there is no template-specific
 * component, route, query, or conditional anywhere else in the codebase.
 * That is the test of whether the configuration layer is real.
 */

export type TemplateKey = "generic" | "retail" | "handmade" | "service" | "wholesale";

export type StatusSeed = {
  key: string; label: string; color: string;
  isDefault?: boolean; isCompleted?: boolean;
  semantic: "NONE" | "PRODUCTION" | "SHIPMENT" | "COMPLETION" | "CANCELLED";
};

export type ConfigSeed = {
  label: string;
  description: string;
  settings: Partial<OrgSettingsData>;
  statuses: StatusSeed[];
  paymentMethods: { key: string; label: string }[];
  expenseCategories: string[];
  productCategories: string[];
  customFields?: {
    entityType: "ORDER" | "CUSTOMER" | "PRODUCT" | "EXPENSE" | "EVENT";
    key: string; label: string;
    type: "TEXT" | "TEXTAREA" | "NUMBER" | "CURRENCY" | "DATE" | "SELECT" | "MULTI_SELECT" | "CHECKBOX" | "URL" | "FILE";
    options?: { value: string; label: string }[];
    showInTable?: boolean;
  }[];
};

const CANCELLED: StatusSeed = { key: "cancelled", label: "Cancelled", color: "rose", semantic: "CANCELLED" };

export const TEMPLATES: Record<TemplateKey, ConfigSeed> = {
  generic: {
    label: "Generic",
    description: "A neutral starting point. Rename everything to suit your business.",
    settings: { modules: { orders: true, customers: true, products: true, payments: true, expenses: true, events: false, analytics: true, inventory: false, suppliers: false, invoices: false, delivery: false, staff: false } },
    statuses: [
      { key: "pending", label: "Pending", color: "neutral", isDefault: true, semantic: "NONE" },
      { key: "in_progress", label: "In Progress", color: "amber", semantic: "PRODUCTION" },
      { key: "ready", label: "Ready", color: "sky", semantic: "SHIPMENT" },
      { key: "completed", label: "Completed", color: "emerald", isCompleted: true, semantic: "COMPLETION" },
      CANCELLED,
    ],
    paymentMethods: [{ key: "cash", label: "Cash" }, { key: "upi", label: "UPI" }, { key: "bank_transfer", label: "Bank Transfer" }],
    expenseCategories: ["Supplies", "Transport", "Advertising", "Miscellaneous"],
    productCategories: [],
  },

  handmade: {
    label: "Handmade / Craft",
    description: "Made-to-order products, customer-specific pricing, and production planning for stalls and events.",
    settings: {
      modules: { orders: true, customers: true, products: true, payments: true, expenses: true, events: true, analytics: true, inventory: false, suppliers: false, invoices: false, delivery: false, staff: false },
      pricing: { enableCustomerSpecificPricing: true, enableDiscounts: true, enableAdditionalCharges: false, enableTax: false, taxRatePercent: 0, taxInclusive: false, enableCostTracking: false },
      orders: { requireCustomer: true, requireDeliveryDate: false, defaultDeliveryLeadDays: 7, dueSoonDays: 2 },
    },
    statuses: [
      { key: "not_started", label: "Not Started", color: "neutral", isDefault: true, semantic: "PRODUCTION" },
      { key: "in_progress", label: "In Progress", color: "amber", semantic: "PRODUCTION" },
      { key: "ready_to_ship", label: "Ready to Ship", color: "sky", semantic: "SHIPMENT" },
      { key: "in_transit", label: "In Transit", color: "blue", semantic: "SHIPMENT" },
      { key: "delivered", label: "Delivered", color: "emerald", isCompleted: true, semantic: "COMPLETION" },
      CANCELLED,
    ],
    paymentMethods: [{ key: "cash", label: "Cash" }, { key: "upi", label: "UPI" }, { key: "bank_transfer", label: "Bank Transfer" }],
    expenseCategories: ["Raw Materials", "Packaging", "Transport", "Event Fees", "Advertising", "Miscellaneous"],
    productCategories: ["Keychains", "Flowers", "Bags", "Plushies", "Accessories", "Home Decor"],
    customFields: [
      { entityType: "PRODUCT", key: "color", label: "Colour", type: "TEXT", showInTable: true },
      { entityType: "PRODUCT", key: "yarn_type", label: "Yarn type", type: "SELECT", options: [
        { value: "cotton", label: "Cotton" }, { value: "acrylic", label: "Acrylic" },
        { value: "wool", label: "Wool" }, { value: "velvet", label: "Velvet" },
      ] },
      { entityType: "ORDER", key: "customisation", label: "Customisation", type: "TEXTAREA" },
      { entityType: "CUSTOMER", key: "instagram", label: "Instagram", type: "TEXT", showInTable: true },
    ],
  },

  retail: {
    label: "Retail",
    description: "Over-the-counter sales with stock-style products and simple statuses.",
    settings: {
      modules: { orders: true, customers: true, products: true, payments: true, expenses: true, events: false, analytics: true, inventory: false, suppliers: false, invoices: false, delivery: false, staff: false },
      pricing: { enableCustomerSpecificPricing: false, enableDiscounts: true, enableAdditionalCharges: false, enableTax: true, taxRatePercent: 5, taxInclusive: true, enableCostTracking: true },
      orders: { requireCustomer: false, requireDeliveryDate: false, defaultDeliveryLeadDays: 0, dueSoonDays: 1 },
    },
    statuses: [
      { key: "new", label: "New", color: "neutral", isDefault: true, semantic: "NONE" },
      { key: "packed", label: "Packed", color: "amber", semantic: "SHIPMENT" },
      { key: "collected", label: "Collected", color: "emerald", isCompleted: true, semantic: "COMPLETION" },
      CANCELLED,
    ],
    paymentMethods: [{ key: "cash", label: "Cash" }, { key: "upi", label: "UPI" }, { key: "card", label: "Card" }],
    expenseCategories: ["Stock Purchase", "Rent", "Utilities", "Staff", "Miscellaneous"],
    productCategories: [],
  },

  service: {
    label: "Service",
    description: "Jobs and bookings rather than physical products.",
    settings: {
      modules: { orders: true, customers: true, products: true, payments: true, expenses: true, events: false, analytics: true, inventory: false, suppliers: false, invoices: false, delivery: false, staff: false },
      terminology: {
        customer: { one: "Client", many: "Clients" },
        product: { one: "Service", many: "Services" },
        order: { one: "Job", many: "Jobs" },
        event: { one: "Campaign", many: "Campaigns" },
        expense: { one: "Cost", many: "Costs" },
        payment: { one: "Payment", many: "Payments" },
      },
    },
    statuses: [
      { key: "enquiry", label: "Enquiry", color: "neutral", isDefault: true, semantic: "NONE" },
      { key: "scheduled", label: "Scheduled", color: "sky", semantic: "NONE" },
      { key: "in_progress", label: "In Progress", color: "amber", semantic: "PRODUCTION" },
      { key: "completed", label: "Completed", color: "emerald", isCompleted: true, semantic: "COMPLETION" },
      CANCELLED,
    ],
    paymentMethods: [{ key: "cash", label: "Cash" }, { key: "upi", label: "UPI" }, { key: "bank_transfer", label: "Bank Transfer" }],
    expenseCategories: ["Subcontractors", "Software", "Travel", "Marketing", "Miscellaneous"],
    productCategories: [],
  },

  wholesale: {
    label: "Wholesale",
    description: "Bulk orders with per-buyer agreed pricing and longer lead times.",
    settings: {
      modules: { orders: true, customers: true, products: true, payments: true, expenses: true, events: false, analytics: true, inventory: false, suppliers: false, invoices: false, delivery: false, staff: false },
      pricing: { enableCustomerSpecificPricing: true, enableDiscounts: true, enableAdditionalCharges: true, enableTax: true, taxRatePercent: 18, taxInclusive: false, enableCostTracking: true },
      orders: { requireCustomer: true, requireDeliveryDate: true, defaultDeliveryLeadDays: 14, dueSoonDays: 3 },
      terminology: {
        customer: { one: "Buyer", many: "Buyers" },
        product: { one: "SKU", many: "SKUs" },
        order: { one: "Order", many: "Orders" },
        event: { one: "Production Run", many: "Production Runs" },
        expense: { one: "Purchase", many: "Purchases" },
        payment: { one: "Payment", many: "Payments" },
      },
    },
    statuses: [
      { key: "confirmed", label: "Confirmed", color: "neutral", isDefault: true, semantic: "NONE" },
      { key: "production", label: "In Production", color: "amber", semantic: "PRODUCTION" },
      { key: "packed", label: "Packed", color: "sky", semantic: "SHIPMENT" },
      { key: "dispatched", label: "Dispatched", color: "blue", semantic: "SHIPMENT" },
      { key: "delivered", label: "Delivered", color: "emerald", isCompleted: true, semantic: "COMPLETION" },
      CANCELLED,
    ],
    paymentMethods: [{ key: "bank_transfer", label: "Bank Transfer" }, { key: "upi", label: "UPI" }, { key: "cheque", label: "Cheque" }, { key: "cash", label: "Cash" }],
    expenseCategories: ["Raw Materials", "Freight", "Packaging", "Labour", "Miscellaneous"],
    productCategories: [],
  },
};

export const TEMPLATE_LIST = (Object.keys(TEMPLATES) as TemplateKey[]).map((key) => ({
  key, ...TEMPLATES[key],
}));
