# C. Configuration Architecture

The rule: **whenever you are tempted to write `if (businessType === …)`, add a configuration key instead.** This document defines the configuration surface, where each piece lives, and how the application consumes it.

---

## 1. Where configuration lives

| Kind of setting | Storage | Why |
|---|---|---|
| Lists the user manages and transactional data references | **Relational tables** (`StatusDefinition`, `PaymentMethod`, `Category`, `CustomFieldDefinition`, `NumberSequence`) | They need identity, foreign keys, sort order, and soft-delete. Renaming a status must instantly and correctly change every historical order — only possible if orders reference it by id. |
| Scalar preferences with no referential meaning | **`OrgSettings.data` JSONB** | Terminology, module toggles, formats, policies, dashboard layout. One row, one read per request, Zod-validated with complete defaults. |

Nothing is stored in code. Nothing is stored in environment variables. A new business is a new set of rows.

---

## 2. `OrgSettings.data` — the full shape

```ts
{
  terminology: {
    customer:  { one: "Customer", many: "Customers" },
    product:   { one: "Product",  many: "Products"  },
    order:     { one: "Order",    many: "Orders"    },
    event:     { one: "Event",    many: "Events"    },
    expense:   { one: "Expense",  many: "Expenses"  },
    payment:   { one: "Payment",  many: "Payments"  },
  },

  modules: {
    orders: true, customers: true, products: true, payments: true,
    expenses: true, events: true, analytics: true,
    inventory: false, suppliers: false, invoices: false,
    delivery: false, staff: false,
  },

  formats: {
    dateFormat: "dd MMM yyyy",      // en-IN friendly
    numberFormat: "en-IN",           // 1,20,000 grouping
    currencyCode: "INR",
    currencySymbol: "₹",
    currencyPosition: "before",
    timezone: "Asia/Kolkata",
    weekStartsOn: 1,
  },

  pricing: {
    enableCustomerSpecificPricing: true,
    enableDiscounts: true,
    enableAdditionalCharges: false,
    enableTax: false,
    taxRatePercent: 0,
    taxInclusive: false,
    enableCostTracking: false,        // profitability is opt-in (req. 29)
  },

  payments: {
    overpaymentPolicy: "FLAG",        // "REJECT" | "CREDIT" | "FLAG"  (req. 43)
    autoAdvanceStatusOnFullPayment: false,
  },

  events: {
    allowOverproduction: false,
    completeThresholdPct: 100,
  },

  orders: {
    requireDeliveryDate: false,
    requireCustomer: true,
    defaultDeliveryLeadDays: 7,
    dueSoonDays: 2,                   // drives the amber "due in 2 days" chip
  },

  dashboard: {
    widgets: [
      { key: "today",              enabled: true,  order: 1, range: "today" },
      { key: "needsAttention",     enabled: true,  order: 2 },
      { key: "productionProgress", enabled: true,  order: 3 },
      { key: "topProducts",        enabled: true,  order: 4, range: "month" },
      { key: "expenses",           enabled: true,  order: 5, range: "month" },
      { key: "revenueChart",       enabled: true,  order: 6, range: "6months" },
      { key: "outstanding",        enabled: true,  order: 7 },
      { key: "recentActivity",     enabled: false, order: 8 },
      { key: "profit",             enabled: false, order: 9 },
    ],
  },

  fields: {
    // per-entity field policy, merged over built-in defaults
    customer: { email: { enabled: true, required: false, label: "Email" },
                gstin: { enabled: false }, instagram: { enabled: true, label: "Instagram" } },
    order:    { deliveryByDate: { enabled: true, required: false, label: "Delivery by" } },
  },
}
```

Reading it:

```ts
const config = await getOrgConfig(orgId);   // request-cached
config.t("customer", "many")                // → "Customers" | "Clients" | "Guests"
config.modules.events                       // → boolean, drives sidebar + routing
config.money.format(125000)                 // → "₹1,250.00"
```

`getOrgConfig` merges stored JSON over `DEFAULT_SETTINGS` with Zod, so **an org created before a new setting existed still works** — the new key simply resolves to its default. This is the migration story for configuration: additive keys, never breaking reads.

---

## 3. Terminology

Internal names never change. `Order` is `orders` in the database, `Order` in the generated types, and `Order` in the domain layer, forever. Only labels change, and only through one accessor:

```tsx
const { t } = useOrgConfig();
<h1>{t("order", "many")}</h1>        // "Orders" | "Bookings" | "Jobs" | "Projects"
<Button>New {t("order")}</Button>
```

Rendering a hardcoded user-facing noun ("Customer", "Product", "Order") in a component is a review-blocking defect. The sidebar, page titles, buttons, empty states, table headers, toasts and validation messages all resolve through `t()`.

---

## 4. Statuses — configurable *and* meaningful

The hard part of configurable statuses is that features still need to reason about them. Solved with the `semantic` field:

| Feature that needs meaning | Query it actually runs |
|---|---|
| "Orders in production" widget | statuses where `semantic = PRODUCTION` |
| "Ready to ship / dispatched" | `semantic = SHIPMENT` |
| Revenue recognition, completion % | `isCompleted = true` |
| Excluding cancelled work from metrics | `semantic = CANCELLED` |

Crochet configures: `Not Started (PRODUCTION, default)` → `In Progress (PRODUCTION)` → `Ready to Ship (SHIPMENT)` → `In Transit (SHIPMENT)` → `Delivered (COMPLETION, isCompleted)`.
A print shop configures: `New (NONE)` → `Designing (PRODUCTION)` → `Printing (PRODUCTION)` → `Packed (SHIPMENT)` → `Collected (COMPLETION, isCompleted)`.
**The dashboard code is identical for both.**

Frontend components receive `{ label, color, isCompleted, semantic }` and render from that. No component contains a status string.

---

## 5. Custom fields end-to-end

1. Owner defines a field in Settings → `CustomFieldDefinition` row (`entityType=PRODUCT`, `key=yarn_type`, `type=SELECT`, options).
2. `<CustomFieldsSection entityType="PRODUCT" />` renders inputs from the definitions — one generic renderer per field type, no bespoke forms.
3. On submit, `validateCustomFields(defs, input)` builds a Zod schema *from the definitions* and parses. Required-ness, numeric ranges, and select-option membership are enforced server-side.
4. Values are upserted into `CustomFieldValue` in the same transaction as the parent entity.
5. `showInTable: true` makes the field available as a `DataTable` column and as a filter, with no code change.

Supported types: Text, Textarea, Number, Currency, Date, Dropdown, Multi-select, Checkbox, URL, File.

---

## 6. Modules

`config.modules` is consulted in three places, and only three:

- **Navigation** — disabled modules are absent from the sidebar and from Quick Add.
- **Routing** — a middleware-level guard returns 404 for a disabled module's routes, so a bookmarked URL cannot bypass the setting.
- **Dashboard** — widgets belonging to a disabled module are filtered out before layout.

Disabling a module never deletes data. Re-enabling it restores exactly the previous state.

---

## 7. Templates

```ts
type ConfigSeed = {
  settings: Partial<OrgSettingsData>;
  statuses: StatusSeed[];
  paymentMethods: { key: string; label: string }[];
  expenseCategories: string[];
  productCategories: string[];
  customFields?: CustomFieldSeed[];
};

const TEMPLATES: Record<TemplateKey, ConfigSeed> = {
  generic: {...}, retail: {...}, handmade: {...}, service: {...}, wholesale: {...},
};
```

`applyTemplate(orgId, key)` runs once at signup and writes rows. That is the *entire* implementation. There is no template-specific component, route, query, or conditional anywhere else in the codebase — which is precisely the test of whether the configuration layer is real.

**Handmade / Craft** (the crochet default): modules Orders, Customers, Products, Payments, Expenses, Events, Analytics · statuses Not Started → In Progress → Ready to Ship → In Transit → Delivered · methods Cash, UPI, Bank Transfer · expense categories Raw Materials, Packaging, Transport, Event Fees, Advertising, Miscellaneous · product categories Keychains, Flowers, Bags, Plushies, Accessories, Home Decor · customer-specific pricing on · events on.

---

## 8. Numbering

`NumberSequence` per entity type: `pattern` (`{PREFIX}-{YYYY}-{SEQ:4}`), `prefix`, `nextValue`, `resetPolicy`. Produces `ORD-2026-0042`, `CUS-00042`, `EXP-00018`, `EVT-00007`. The database `id` is a UUID and is the only thing foreign keys point at, so a business can renumber its documents without touching a single relationship. Spreadsheet serial numbers are import metadata, never identity.
