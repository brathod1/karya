# B. Database Schema

PostgreSQL, defined in TypeScript with Drizzle (`src/server/db/schema.ts`) and migrated with plain reviewable SQL in `drizzle/`. All money is `integer` **minor units** (paise for INR, cents for USD) — never float, never decimal-as-string.
All tenant tables carry `orgId`. All user-visible uniqueness is scoped `@@unique([orgId, ...])`.
Deletion of anything financial or historical is **soft** (`archivedAt`/`deletedAt`), never `DELETE`.

---

## 1. Identity & tenancy

### `User`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | citext unique | global — a person can belong to several orgs |
| name | text | |
| passwordHash | text | bcrypt, cost 12 |
| createdAt / updatedAt | timestamptz | |

### `Organization`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | "Threads by Riya" |
| slug | text unique | url key |
| logoUrl | text null | |
| currencyCode | char(3) | default `INR` |
| currencySymbol | text | default `₹` |
| locale | text | default `en-IN` |
| timezone | text | default `Asia/Kolkata` |
| templateKey | text | provenance only; **never branched on** |
| createdAt / updatedAt | | |

### `Membership`
`(orgId, userId)` unique · `role` enum `OWNER | ADMIN | STAFF | VIEWER` · `invitedEmail`, `acceptedAt` for pending invites.
Index: `(userId)`, `(orgId, role)`.

### `OrgSettings`
`orgId` pk/fk · `data` **jsonb** · `version` int.
Holds terminology, module toggles, formats, pricing + overpayment policy, dashboard layout. Validated by Zod on read with full defaults, so a missing key is never a runtime error.

---

## 2. Configuration entities

### `StatusDefinition`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| orgId | uuid fk | |
| kind | enum `ORDER \| EVENT_ITEM` | one table serves every status-bearing entity |
| key | text | stable slug, e.g. `in_progress`; **immutable after creation** |
| label | text | display name; freely renameable |
| color | text | token name (`amber`, `emerald`…) not a hex, so themes stay coherent |
| sortOrder | int | |
| isDefault | bool | status applied to new records |
| isCompleted | bool | counts as "done" in progress metrics |
| semantic | enum `NONE \| PRODUCTION \| SHIPMENT \| COMPLETION \| CANCELLED` | lets features reason about status *meaning* without hardcoding labels |
| isActive | bool | disable without deleting — history stays valid |

`@@unique([orgId, kind, key])`, index `(orgId, kind, sortOrder)`.

> **Why `semantic`:** the dashboard must show "orders in production" and "orders shipped" for *any* business. It asks for statuses where `semantic = PRODUCTION`, not for the literal string "In Progress". This is the mechanism that makes configurable statuses genuinely configurable rather than cosmetic.

### `PaymentMethod`
`id, orgId, key, label, sortOrder, isActive`. `@@unique([orgId, key])`.

### `Category`
`id, orgId, kind (PRODUCT | EXPENSE), name, parentId (self fk, nullable), sortOrder, archivedAt`.
`@@unique([orgId, kind, name])` (partial: `where archivedAt is null`). Nesting is one table, arbitrary depth, guarded against cycles in the domain layer.

### `CustomFieldDefinition`
| column | notes |
|---|---|
| id, orgId | |
| entityType | enum `ORDER \| ORDER_ITEM \| CUSTOMER \| PRODUCT \| EXPENSE \| EVENT` |
| key | slug, unique per `(orgId, entityType)`, immutable |
| label, helpText | display |
| type | enum `TEXT \| TEXTAREA \| NUMBER \| CURRENCY \| DATE \| SELECT \| MULTI_SELECT \| CHECKBOX \| URL \| FILE` |
| options | jsonb — `[{value,label,color}]` for SELECT/MULTI_SELECT |
| isRequired, isActive, sortOrder | |
| defaultValue | jsonb |
| showInTable | bool — may appear as a `DataTable` column |

### `CustomFieldValue`
`id, orgId, definitionId fk, entityType, entityId (uuid), value jsonb`.
`@@unique([definitionId, entityId])`, index `(orgId, entityType, entityId)`, GIN index on `value` for search.

> **Why EAV + JSONB rather than per-tenant physical columns:** dynamic `ALTER TABLE` per tenant makes migrations, backups and connection pooling hostile at even modest scale. JSONB values with typed *definitions* keep validation strict — `parseCustomFields` builds a Zod schema *from* the definitions at request time — while writes stay ordinary rows. Reads are one extra join, batched per page.

### `NumberSequence`
`id, orgId, entityType, prefix, pattern ('{PREFIX}-{YYYY}-{SEQ:4}'), nextValue, resetPolicy (NEVER|YEARLY|MONTHLY), lastResetAt`.
Allocation happens inside the creating transaction with `SELECT … FOR UPDATE`, so numbers never collide and never skip silently.

---

## 3. Commercial entities

### `Customer`
`id, orgId, code (CUS-00042), name, phone, email, address, notes, tags text[], archivedAt, createdAt, updatedAt`.
Indexes: `@@unique([orgId, code])`, `(orgId, name)`, GIN trigram on `name` and `phone` for search.

### `Product`
`id, orgId, code, name, description, categoryId fk null, defaultPriceMinor int, costMinor int null, unit text (default 'pcs'), imageUrl, isActive, archivedAt`.
`costMinor` nullable **by design** — profitability is opt-in; the business may not know cost yet and must never be blocked by it.

### `CustomerPrice`
`id, orgId, customerId fk, productId fk null, priceMinor int null, discountPercent numeric(5,2) null, note, validFrom date null, validTo date null`.
`@@unique([orgId, customerId, productId])`.
A row with `productId = NULL` is a **customer-wide rule** (e.g. "Customer B gets 10% off everything"). A row with a product is a specific agreed price. This one table covers both requirements without a second concept.

---

## 4. Orders

### `Order`
| column | notes |
|---|---|
| id uuid pk, orgId | |
| number text | human-readable `ORD-2026-0042`, `@@unique([orgId, number])` |
| customerId fk null | walk-in sales allowed |
| orderDate date | |
| deliveryByDate date null · deliveryTime time null | |
| requestedDate date null · internalDeadline date null | |
| statusId fk → StatusDefinition | |
| note, internalNote, customerNote text | three distinct notes, as specified |
| subtotalMinor, discountMinor, additionalChargesMinor, taxMinor, totalMinor int | **snapshot**, written by the domain layer |
| discountType enum `AMOUNT \| PERCENT`, discountValue numeric | inputs kept alongside the computed result for auditability |
| paidMinor int | **cache** of `sum(payments)`, only written inside payment/order transactions |
| paymentStatus enum `UNPAID \| PARTIAL \| PAID \| OVERPAID` | derived, stored for indexable filtering |
| source text null | 'manual' \| 'import' \| future channels |
| archivedAt, createdAt, updatedAt, createdByUserId | |

Indexes: `(orgId, orderDate desc)`, `(orgId, statusId)`, `(orgId, paymentStatus)`, `(orgId, deliveryByDate)`, `(orgId, customerId)`.
Check constraints: `subtotalMinor >= 0`, `totalMinor >= 0`, `discountMinor >= 0`.

### `OrderItem`
`id, orgId, orderId fk cascade, productId fk (a product used by history is soft-archived, never deleted), productNameSnapshot text, quantity double precision, unitPriceMinor int, discountMinor int, lineTotalMinor int, priceSource enum (ORDER_OVERRIDE|CUSTOMER_PRODUCT|CUSTOMER_RULE|PRODUCT_DEFAULT|MANUAL), note, sortOrder`.

> `unitPriceMinor` and `productNameSnapshot` are **immutable history**. Changing a product's default price or name tomorrow leaves every past order exactly as it was sold. This directly satisfies requirement 54.
> `priceSource` records *why* that price applied — invaluable when the owner asks "why did this show ₹550?".

Check constraints (enforced in the database, not only in code): `quantity > 0`, `unitPriceMinor >= 0`.

> **On quantity:** money is integer minor units without exception. Quantity is `double precision` because it is a count or a weight, not a currency, and because a line total is computed as `round(quantity × unitPriceMinor)` — the rounding happens once, in minor units, so no float error can reach a money column.

### `Payment`
`id, orgId, orderId fk null, customerId fk null, amountMinor int, paidAt date, methodId fk → PaymentMethod, reference text, note, kind enum (PAYMENT|REFUND|CREDIT), voidedAt, voidReason, createdByUserId`.
`orderId` nullable so a customer-level advance/credit can exist without an order. Refunds are negative-effect rows rather than edits, so history is never rewritten.
Indexes: `(orgId, paidAt desc)`, `(orgId, orderId)`, `(orgId, customerId)`.

---

## 5. Events / production

### `Event`
`id, orgId, code (EVT-00007), name, startDate, endDate, location, notes, budgetMinor null, expectedSalesMinor null, archivedAt`.

### `EventProductionItem`
`id, orgId, eventId fk cascade, productId fk, categoryId fk null, quantityPlanned numeric, quantityCompleted numeric default 0, unitPriceMinor int, note, sortOrder`.
Derived, never stored: `remaining = max(planned − completed, 0)`, `expectedRevenueMinor = planned × unitPrice`, `progressPct`, and production status (`NOT_STARTED` / `IN_PROGRESS` / `COMPLETE`).
Check: `quantityPlanned > 0`, `quantityCompleted >= 0`; overproduction (`completed > planned`) is permitted only when `settings.events.allowOverproduction` is true — otherwise rejected with a clear message.

> **Path to inventory (not built now):** `EventProductionItem` completions are the natural source of a future `StockMovement(+qty, reason: PRODUCTION)`, and event sales become `StockMovement(−qty, reason: SALE)`. Because completions are already quantified per product per event, adding inventory later is additive — no data migration of existing rows.

---

## 6. Expenses

### `Expense`
`id, orgId, code (EXP-00018), date, description, categoryId fk null, amountMinor int, methodId fk null, vendor text, notes, archivedAt, createdByUserId`.
Indexes `(orgId, date desc)`, `(orgId, categoryId)`.

### `Attachment`
`id, orgId, entityType, entityId, fileName, mimeType, sizeBytes, storageKey, uploadedByUserId, createdAt`.
Files are never served from a public bucket; a route handler checks org membership, then streams or issues a short-lived signed URL.

---

## 7. History & operations

### `ActivityEntry` (user-facing timeline)
`id, orgId, entityType, entityId, type, message, meta jsonb, actorUserId, createdAt`.
This is the "18 Aug — ₹500 advance received" feed. Human-readable, rendered on detail pages.

### `AuditLog` (compliance record)
`id, orgId, actorUserId, action, entityType, entityId, before jsonb, after jsonb, ip, userAgent, createdAt`.
Append-only: no update or delete grant in the application role; the only mutation path is `INSERT`. Written in the same transaction as the change it records, so an audited action cannot commit without its audit row.

### `ImportJob`
`id, orgId, fileName, storageKey, targetEntity, mapping jsonb, status enum (DRAFT|VALIDATING|READY|IMPORTING|COMPLETED|FAILED), totalRows, successRows, errorRows, errors jsonb, createdByUserId, completedAt`.
Keeping the mapping means a repeat import of next month's sheet is one click.

### `SavedView`
`id, orgId, userId null (null = shared with org), entityType, name, config jsonb (columns, order, widths, filters, sort), isDefault`.

---

## 8. Constraints that encode business rules

```sql
ALTER TABLE "OrderItem"  ADD CONSTRAINT qty_positive     CHECK (quantity > 0);
ALTER TABLE "OrderItem"  ADD CONSTRAINT price_nonneg     CHECK ("unitPriceMinor" >= 0);
ALTER TABLE "Payment"    ADD CONSTRAINT amount_nonzero   CHECK ("amountMinor" <> 0);
ALTER TABLE "Order"      ADD CONSTRAINT total_nonneg     CHECK ("totalMinor" >= 0);
ALTER TABLE "EventProductionItem" ADD CONSTRAINT planned_positive CHECK ("quantityPlanned" > 0);
ALTER TABLE "EventProductionItem" ADD CONSTRAINT completed_nonneg CHECK ("quantityCompleted" >= 0);
-- soft-delete-aware uniqueness
CREATE UNIQUE INDEX category_unique_active ON "Category" ("orgId", kind, name) WHERE "archivedAt" IS NULL;
```

## 9. Index strategy

Every list screen has a covering index for its default sort, because the first thing that breaks in a spreadsheet replacement is a slow list:

- Orders default view → `(orgId, orderDate DESC)`; "needs attention" → partial index `(orgId, deliveryByDate) WHERE archivedAt IS NULL AND paymentStatus <> 'PAID'`.
- Customer balances → `(orgId, customerId)` on `Order` and `Payment`.
- Search → `pg_trgm` GIN on `Customer.name`, `Customer.phone`, `Product.name`, `Order.number`.
- Custom field search → GIN on `CustomFieldValue.value`.
