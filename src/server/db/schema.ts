/**
 * Karya database schema — PostgreSQL via Drizzle ORM.
 *
 * Invariants enforced here:
 *  · Money is INTEGER MINOR UNITS (paise / cents). No floats, ever.
 *  · Every tenant-owned table carries `orgId`.
 *  · All user-visible uniqueness is scoped to the organisation, never global.
 *  · Financial and historical rows are soft-deleted (`archivedAt`), never removed.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean, check, customType, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable,
  text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

/** Raw bytes. Postgres stores these out-of-line (TOAST), so wide rows stay cheap to scan. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// ───────────────────────────── enums

export const roleEnum = pgEnum("role", ["OWNER", "ADMIN", "STAFF", "VIEWER"]);
export const statusKindEnum = pgEnum("status_kind", ["ORDER", "EVENT_ITEM"]);
export const statusSemanticEnum = pgEnum("status_semantic", [
  "NONE", "PRODUCTION", "SHIPMENT", "COMPLETION", "CANCELLED",
]);
export const categoryKindEnum = pgEnum("category_kind", ["PRODUCT", "EXPENSE"]);
export const entityTypeEnum = pgEnum("entity_type", [
  "ORDER", "ORDER_ITEM", "CUSTOMER", "PRODUCT", "EXPENSE", "EVENT",
]);
export const fieldTypeEnum = pgEnum("field_type", [
  "TEXT", "TEXTAREA", "NUMBER", "CURRENCY", "DATE", "SELECT", "MULTI_SELECT", "CHECKBOX", "URL", "FILE",
]);
export const resetPolicyEnum = pgEnum("reset_policy", ["NEVER", "YEARLY", "MONTHLY"]);
export const paymentStatusEnum = pgEnum("payment_status", ["UNPAID", "PARTIAL", "PAID", "OVERPAID"]);
export const discountTypeEnum = pgEnum("discount_type", ["AMOUNT", "PERCENT"]);
export const priceSourceEnum = pgEnum("price_source", [
  "ORDER_OVERRIDE", "CUSTOMER_PRODUCT", "CUSTOMER_RULE", "PRODUCT_DEFAULT", "MANUAL",
]);
export const paymentKindEnum = pgEnum("payment_kind", ["PAYMENT", "REFUND", "CREDIT"]);
export const importStatusEnum = pgEnum("import_status", [
  "DRAFT", "VALIDATING", "READY", "IMPORTING", "COMPLETED", "FAILED",
]);

const now = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ───────────────────────────── identity & tenancy

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: now(),
  updatedAt: updated(),
}, (t) => [uniqueIndex("users_email_key").on(sql`lower(${t.email})`)]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logoUrl: text("logo_url"),
  currencyCode: text("currency_code").notNull().default("INR"),
  currencySymbol: text("currency_symbol").notNull().default("₹"),
  locale: text("locale").notNull().default("en-IN"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  /** Provenance only. Never branched on anywhere in the codebase. */
  templateKey: text("template_key").notNull().default("generic"),
  businessType: text("business_type"),
  createdAt: now(),
  updatedAt: updated(),
}, (t) => [uniqueIndex("orgs_slug_key").on(t.slug)]);

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull().default("STAFF"),
  invitedEmail: text("invited_email"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => [
  uniqueIndex("memberships_org_user_key").on(t.orgId, t.userId),
  index("memberships_user_idx").on(t.userId),
]);

export const orgSettings = pgTable("org_settings", {
  orgId: uuid("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull().default({}),
  version: integer("version").notNull().default(1),
  updatedAt: updated(),
});

// ───────────────────────────── configuration entities

export const statusDefinitions = pgTable("status_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  kind: statusKindEnum("kind").notNull().default("ORDER"),
  /** Stable slug. Immutable after creation — the label is what users rename. */
  key: text("key").notNull(),
  label: text("label").notNull(),
  /** Design-token name (emerald, amber…), never a hex value. */
  color: text("color").notNull().default("neutral"),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  isCompleted: boolean("is_completed").notNull().default(false),
  /** Lets features reason about status MEANING without hardcoding labels. */
  semantic: statusSemanticEnum("semantic").notNull().default("NONE"),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
}, (t) => [
  uniqueIndex("status_org_kind_key").on(t.orgId, t.kind, t.key),
  index("status_org_kind_sort_idx").on(t.orgId, t.kind, t.sortOrder),
]);

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("payment_method_org_key").on(t.orgId, t.key)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  kind: categoryKindEnum("kind").notNull(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [
  index("category_org_kind_idx").on(t.orgId, t.kind, t.sortOrder),
  uniqueIndex("category_unique_active").on(t.orgId, t.kind, t.name).where(sql`archived_at is null`),
]);

export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  entityType: entityTypeEnum("entity_type").notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  helpText: text("help_text"),
  type: fieldTypeEnum("type").notNull().default("TEXT"),
  /** [{ value, label }] for SELECT / MULTI_SELECT */
  options: jsonb("options"),
  isRequired: boolean("is_required").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  showInTable: boolean("show_in_table").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  defaultValue: jsonb("default_value"),
}, (t) => [
  uniqueIndex("cfd_org_entity_key").on(t.orgId, t.entityType, t.key),
  index("cfd_org_entity_idx").on(t.orgId, t.entityType, t.sortOrder),
]);

export const customFieldValues = pgTable("custom_field_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  definitionId: uuid("definition_id").notNull().references(() => customFieldDefinitions.id, { onDelete: "cascade" }),
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  value: jsonb("value"),
}, (t) => [
  uniqueIndex("cfv_def_entity_key").on(t.definitionId, t.entityId),
  index("cfv_org_entity_idx").on(t.orgId, t.entityType, t.entityId),
]);

export const numberSequences = pgTable("number_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  prefix: text("prefix").notNull(),
  pattern: text("pattern").notNull().default("{PREFIX}-{SEQ:5}"),
  nextValue: integer("next_value").notNull().default(1),
  resetPolicy: resetPolicyEnum("reset_policy").notNull().default("NEVER"),
  lastResetAt: timestamp("last_reset_at", { withTimezone: true }),
}, (t) => [uniqueIndex("seq_org_entity_key").on(t.orgId, t.entityType)]);

// ───────────────────────────── commercial entities

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: now(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("customer_org_code_key").on(t.orgId, t.code),
  index("customer_org_name_idx").on(t.orgId, t.name),
  index("customer_org_live_name_idx").on(t.orgId, t.name).where(sql`archived_at is null`),
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id),
  defaultPriceMinor: integer("default_price_minor").notNull().default(0),
  /** Nullable BY DESIGN: profitability is opt-in and must never block data entry. */
  costMinor: integer("cost_minor"),
  unit: text("unit").notNull().default("pcs"),
  imageUrl: text("image_url"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: now(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("product_org_code_key").on(t.orgId, t.code),
  index("product_org_name_idx").on(t.orgId, t.name),
  index("product_org_category_idx").on(t.orgId, t.categoryId),
  index("product_org_live_name_idx").on(t.orgId, t.name).where(sql`archived_at is null`),
  check("product_price_nonneg", sql`${t.defaultPriceMinor} >= 0`),
]);

/**
 * productId = null  →  a customer-wide rule (e.g. "10% off everything").
 * productId set     →  a specific agreed price for that customer + product.
 */
export const customerPrices = pgTable("customer_prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  priceMinor: integer("price_minor"),
  discountPercent: doublePrecision("discount_percent"),
  note: text("note"),
  validFrom: date("valid_from", { mode: "date" }),
  validTo: date("valid_to", { mode: "date" }),
  createdAt: now(),
}, (t) => [
  uniqueIndex("customer_price_key").on(t.orgId, t.customerId, t.productId),
  index("customer_price_customer_idx").on(t.orgId, t.customerId),
]);

// ───────────────────────────── orders

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  customerId: uuid("customer_id").references(() => customers.id),
  orderDate: date("order_date", { mode: "date" }).notNull().defaultNow(),
  deliveryByDate: date("delivery_by_date", { mode: "date" }),
  deliveryTime: text("delivery_time"),
  requestedDate: date("requested_date", { mode: "date" }),
  internalDeadline: date("internal_deadline", { mode: "date" }),
  statusId: uuid("status_id").notNull().references(() => statusDefinitions.id),
  note: text("note"),
  internalNote: text("internal_note"),
  customerNote: text("customer_note"),
  discountType: discountTypeEnum("discount_type").notNull().default("AMOUNT"),
  discountValue: doublePrecision("discount_value").notNull().default(0),
  subtotalMinor: integer("subtotal_minor").notNull().default(0),
  discountMinor: integer("discount_minor").notNull().default(0),
  additionalChargesMinor: integer("additional_charges_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull().default(0),
  /** Cache of sum(payments). Written ONLY inside order/payment transactions. */
  paidMinor: integer("paid_minor").notNull().default(0),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("UNPAID"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  source: text("source").notNull().default("manual"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: now(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("order_org_number_key").on(t.orgId, t.number),
  index("order_org_date_idx").on(t.orgId, t.orderDate),
  // Every list and aggregate filters live rows and orders by date. A partial
  // index keeps archived rows out of it entirely.
  index("order_org_live_date_idx").on(t.orgId, t.orderDate).where(sql`archived_at is null`),
  index("order_org_live_delivery_idx").on(t.orgId, t.deliveryByDate).where(sql`archived_at is null`),
  index("order_org_status_idx").on(t.orgId, t.statusId),
  index("order_org_paystatus_idx").on(t.orgId, t.paymentStatus),
  index("order_org_delivery_idx").on(t.orgId, t.deliveryByDate),
  index("order_org_customer_idx").on(t.orgId, t.customerId),
  check("order_total_nonneg", sql`${t.totalMinor} >= 0`),
  check("order_subtotal_nonneg", sql`${t.subtotalMinor} >= 0`),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  /** Immutable history: renaming a product never rewrites past orders. */
  productNameSnapshot: text("product_name_snapshot").notNull(),
  quantity: doublePrecision("quantity").notNull().default(1),
  /** Immutable history: changing a product's default price never rewrites past orders. */
  unitPriceMinor: integer("unit_price_minor").notNull().default(0),
  discountMinor: integer("discount_minor").notNull().default(0),
  lineTotalMinor: integer("line_total_minor").notNull().default(0),
  /** Records WHY this price applied — answers "why did this show ₹550?". */
  priceSource: priceSourceEnum("price_source").notNull().default("PRODUCT_DEFAULT"),
  /**
   * What makes this line different from another line of the same product:
   * `{ "colour": "red", "material": "cotton" }`.
   *
   * A snapshot, like the price and the name. Which attributes exist is
   * configuration (CustomFieldDefinition with entityType ORDER_ITEM); what was
   * chosen belongs to the line forever, because it is what she agreed to make.
   */
  attributes: jsonb("attributes"),
  note: text("note"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [
  index("order_item_order_idx").on(t.orgId, t.orderId),
  index("order_item_product_idx").on(t.orgId, t.productId),
  check("order_item_qty_positive", sql`${t.quantity} > 0`),
  check("order_item_price_nonneg", sql`${t.unitPriceMinor} >= 0`),
]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").references(() => customers.id),
  amountMinor: integer("amount_minor").notNull(),
  paidAt: date("paid_at", { mode: "date" }).notNull().defaultNow(),
  methodId: uuid("method_id").references(() => paymentMethods.id),
  reference: text("reference"),
  note: text("note"),
  kind: paymentKindEnum("kind").notNull().default("PAYMENT"),
  /**
   * Ties the two halves of a credit movement together: the order payment and
   * the matching credit-ledger row. Voiding either voids both, so the ledger
   * and the order can never drift apart.
   */
  linkedPaymentId: uuid("linked_payment_id"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: now(),
}, (t) => [
  index("payment_org_date_idx").on(t.orgId, t.paidAt),
  index("payment_org_order_idx").on(t.orgId, t.orderId),
  index("payment_org_customer_idx").on(t.orgId, t.customerId),
  // Credit balance reads exactly this shape, on every payment sheet.
  index("payment_org_customer_kind_idx").on(t.orgId, t.customerId, t.kind),
  check("payment_amount_nonzero", sql`${t.amountMinor} <> 0`),
]);

// ───────────────────────────── events / production

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  startDate: date("start_date", { mode: "date" }),
  endDate: date("end_date", { mode: "date" }),
  location: text("location"),
  notes: text("notes"),
  budgetMinor: integer("budget_minor"),
  expectedSalesMinor: integer("expected_sales_minor"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: now(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("event_org_code_key").on(t.orgId, t.code),
  index("event_org_start_idx").on(t.orgId, t.startDate),
]);

export const eventProductionItems = pgTable("event_production_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  quantityPlanned: doublePrecision("quantity_planned").notNull().default(1),
  quantityCompleted: doublePrecision("quantity_completed").notNull().default(0),
  unitPriceMinor: integer("unit_price_minor").notNull().default(0),
  note: text("note"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: now(),
  updatedAt: updated(),
}, (t) => [
  index("event_item_event_idx").on(t.orgId, t.eventId),
  check("event_item_planned_positive", sql`${t.quantityPlanned} > 0`),
  check("event_item_completed_nonneg", sql`${t.quantityCompleted} >= 0`),
]);

// ───────────────────────────── expenses

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  date: date("date", { mode: "date" }).notNull().defaultNow(),
  description: text("description").notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  amountMinor: integer("amount_minor").notNull(),
  methodId: uuid("method_id").references(() => paymentMethods.id),
  vendor: text("vendor"),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: now(),
  updatedAt: updated(),
}, (t) => [
  uniqueIndex("expense_org_code_key").on(t.orgId, t.code),
  index("expense_org_date_idx").on(t.orgId, t.date),
  index("expense_org_live_date_idx").on(t.orgId, t.date).where(sql`archived_at is null`),
  index("expense_org_category_idx").on(t.orgId, t.categoryId),
  check("expense_amount_nonneg", sql`${t.amountMinor} >= 0`),
]);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id"),
  createdAt: now(),
}, (t) => [index("attachment_entity_idx").on(t.orgId, t.entityType, t.entityId)]);

// ───────────────────────────── history & operations

/** User-facing timeline: "18 Aug — ₹500 advance received". */
export const activityEntries = pgTable("activity_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  entityType: entityTypeEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  meta: jsonb("meta"),
  actorUserId: uuid("actor_user_id"),
  actorName: text("actor_name"),
  createdAt: now(),
}, (t) => [
  index("activity_entity_idx").on(t.orgId, t.entityType, t.entityId, t.createdAt),
  index("activity_org_idx").on(t.orgId, t.createdAt),
]);

/** Compliance record. Append-only: the app never updates or deletes these rows. */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id"),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: now(),
}, (t) => [
  index("audit_org_idx").on(t.orgId, t.createdAt),
  index("audit_entity_idx").on(t.orgId, t.entityType, t.entityId),
]);

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  targetEntity: text("target_entity").notNull(),
  mapping: jsonb("mapping"),
  status: importStatusEnum("status").notNull().default("DRAFT"),
  totalRows: integer("total_rows").notNull().default(0),
  successRows: integer("success_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  errors: jsonb("errors"),
  summary: jsonb("summary"),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: now(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [index("import_org_idx").on(t.orgId, t.createdAt)]);

/**
 * Attachment bytes, when the `database` storage driver is in use.
 *
 * Kept in a separate table from `attachments` so that listing files never drags
 * the payloads along, and keyed by the same storage key the local-disk driver
 * uses — the driver interface is identical either way.
 */
export const attachmentBlobs = pgTable("attachment_blobs", {
  storageKey: text("storage_key").primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  createdAt: now(),
}, (t) => [index("attachment_blob_org_idx").on(t.orgId)]);

/**
 * Password reset.
 *
 * Only the SHA-256 hash of the token is stored, so a database leak does not
 * hand over working reset links. Tokens are single use and short lived, and
 * consuming one bumps the user's `sessionVersion`, signing out every device.
 */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  issuedByUserId: uuid("issued_by_user_id"),
  createdAt: now(),
}, (t) => [
  uniqueIndex("password_reset_token_hash_key").on(t.tokenHash),
  index("password_reset_user_idx").on(t.userId),
]);

/**
 * Login throttling.
 *
 * Deliberately a table rather than an in-memory counter: an in-process map is
 * useless the moment the app runs on more than one instance, or restarts, which
 * is exactly when someone is hammering it.
 */
export const authAttempts = pgTable("auth_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Lower-cased email, or an IP address. */
  scope: text("scope").notNull(),
  key: text("key").notNull(),
  createdAt: now(),
}, (t) => [index("auth_attempt_lookup_idx").on(t.scope, t.key, t.createdAt)]);

export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  entityType: text("entity_type").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: now(),
}, (t) => [index("saved_view_org_entity_idx").on(t.orgId, t.entityType)]);

// ───────────────────────────── relations

export const orgRelations = relations(organizations, ({ many, one }) => ({
  memberships: many(memberships),
  settings: one(orgSettings, { fields: [organizations.id], references: [orgSettings.orgId] }),
}));

export const membershipRelations = relations(memberships, ({ one }) => ({
  org: one(organizations, { fields: [memberships.orgId], references: [organizations.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const categoryRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: "tree" }),
  children: many(categories, { relationName: "tree" }),
  products: many(products),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  prices: many(customerPrices),
  orderItems: many(orderItems),
}));

export const customerRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  payments: many(payments),
  prices: many(customerPrices),
}));

export const customerPriceRelations = relations(customerPrices, ({ one }) => ({
  customer: one(customers, { fields: [customerPrices.customerId], references: [customers.id] }),
  product: one(products, { fields: [customerPrices.productId], references: [products.id] }),
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  status: one(statusDefinitions, { fields: [orders.statusId], references: [statusDefinitions.id] }),
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const paymentRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  customer: one(customers, { fields: [payments.customerId], references: [customers.id] }),
  method: one(paymentMethods, { fields: [payments.methodId], references: [paymentMethods.id] }),
}));

export const eventRelations = relations(events, ({ many }) => ({ items: many(eventProductionItems) }));

export const eventItemRelations = relations(eventProductionItems, ({ one }) => ({
  event: one(events, { fields: [eventProductionItems.eventId], references: [events.id] }),
  product: one(products, { fields: [eventProductionItems.productId], references: [products.id] }),
  category: one(categories, { fields: [eventProductionItems.categoryId], references: [categories.id] }),
}));

export const expenseRelations = relations(expenses, ({ one }) => ({
  category: one(categories, { fields: [expenses.categoryId], references: [categories.id] }),
  method: one(paymentMethods, { fields: [expenses.methodId], references: [paymentMethods.id] }),
}));

export const customFieldValueRelations = relations(customFieldValues, ({ one }) => ({
  definition: one(customFieldDefinitions, {
    fields: [customFieldValues.definitionId], references: [customFieldDefinitions.id],
  }),
}));

// ───────────────────────────── inferred types

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type StatusDefinition = typeof statusDefinitions.$inferSelect;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type CustomerPrice = typeof customerPrices.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventProductionItem = typeof eventProductionItems.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ActivityEntry = typeof activityEntries.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
