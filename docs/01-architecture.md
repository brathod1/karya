# A. Product Architecture

**Product name (working):** **Karya** — a configurable operations platform for small businesses.
**Reference implementation:** a crochet business (orders, production for events/stalls, expenses).
**Core principle:** *the workflow is configuration; the platform is reusable.* There is no `if (businessType === 'crochet')` anywhere in the codebase.

---

## 1. The one-paragraph version

Karya is a multi-tenant SaaS. Each business is an **Organization** (a workspace). Every organization carries its own **configuration set** — enabled modules, terminology, order statuses, payment methods, categories, custom fields, numbering formats, currency, timezone, dashboard widgets. The application code reads that configuration at request time and renders itself accordingly. A "business template" (Handmade/Craft, Retail, Service, Wholesale, Generic) is nothing more than a **starting set of configuration rows** written at signup — it introduces zero new code paths. Business meaning lives in a **domain layer** (pricing, balances, production progress, revenue) that is the single authoritative implementation of every calculation; the UI never re-implements arithmetic.

---

## 2. Chosen stack, and why

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript** | One deployable unit for UI + API. React Server Components let order/expense tables render server-side against Postgres with no client waterfall — this matters because the whole product is data-dense tables. Server Actions give type-safe mutations without hand-writing a REST layer. Alternative considered: separate NestJS API + Vite SPA — better for a large engineering team, strictly worse for a one-to-three person team shipping an MVP (two deploys, duplicated types, CORS, auth plumbing). |
| Styling | **Tailwind CSS v4** with a token layer in CSS variables | Design tokens as CSS variables mean theming (per-org logo/accent later) is a variable swap, not a rebuild. |
| Components | **Hand-rolled primitives** (`Button`, `Input`, `Select`, `Badge`, `Card`, `Dialog`, `Sheet`, `DataTable`) on Radix-free plain React | The MVP needs ~15 primitives. Owning them avoids a dependency whose upgrade path we do not control, and the `DataTable` has requirements (saved views, column config, server-side filters) that no off-the-shelf component satisfies without heavy wrapping anyway. |
| Database | **PostgreSQL 14+** | Financial data needs real transactions, foreign keys, and check constraints. Postgres also gives us `JSONB` + GIN indexes for the custom-field and settings blobs, partial indexes for soft delete, and Row-Level Security as a second line of tenant defence. |
| ORM | **Drizzle ORM** | Schema *is* TypeScript, so a column change is a compile error across the domain layer and the UI. No code-generation step and no native engine binary, which keeps `npm install` honest and CI reproducible. Prisma was the first choice and is a reasonable alternative; Drizzle won on the absence of a generate step, SQL that stays legible at the call site, and migrations that are plain reviewable `.sql`. |
| Auth | **Session cookie + `jose` JWT + bcrypt**, own tables | No external identity dependency for the MVP; `User`/`Membership` are our tables, so roles and workspace invitations are ordinary rows. Swappable for Supabase Auth / Auth.js later because the only integration point is `getSession()`. |
| Files | **Storage driver interface**, local-disk driver implemented | Receipts and product images must not couple the domain to a vendor. Only the local driver exists today, and `STORAGE_DRIVER` offers no other value — an unimplemented option in configuration is worse than no option. The local driver writes to the filesystem, so an object-storage driver is required before deploying attachments to a serverless host. |
| Charts | **Recharts** | Compositional, SSR-friendly, and small enough for the six chart types the MVP needs. |
| Import | **SheetJS**, from the vendor's own distribution | Reads `.xlsx`, `.xls`, `.csv` from one code path, which is exactly the Google Sheets export surface. Pinned to `cdn.sheetjs.com` rather than the npm registry: the registry copy is frozen at 0.18.5 with two published advisories, because SheetJS stopped publishing there. All use is behind `server/spreadsheet.ts`, so the parser is replaceable in one file. |
| Money | **Integer minor units** (paise/cents) + a `Money` module | Floating point is disqualified for money. Every amount in the database is `Int`, formatted only at the edge. |

**Why not Supabase-first?** Supabase is a fine hosting target and the schema is written to run on it unchanged. But making Supabase client libraries the data-access path would push business logic into RLS policies and client queries, which is exactly where configurable pricing and balance rules become impossible to test. The app talks to Postgres through Drizzle; Supabase, Neon, RDS, or a local Postgres are interchangeable.

---

## 3. Layered structure

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation      app/(app)/**   React Server Components,   │
│                                  client islands for forms   │
├─────────────────────────────────────────────────────────────┤
│ Controllers       server/actions/**   Server Actions:       │
│                   auth → validate (Zod) → call domain →     │
│                   revalidate. NO arithmetic here.           │
├─────────────────────────────────────────────────────────────┤
│ Domain            server/domain/**                          │
│   pricing.ts      price resolution chain, line + order math │
│   orders.ts       create/update order as one transaction    │
│   payments.ts     record/void payment, balance, over-pay    │
│   events.ts       production progress + derived status      │
│   analytics.ts    all dashboard/report aggregates           │
│   numbering.ts    ORD-2026-0042 style human identifiers     │
│   audit.ts        append-only activity + audit entries      │
│   config.ts       resolve org configuration into one object │
│   customFields.ts definition-driven validation + storage    │
├─────────────────────────────────────────────────────────────┤
│ Data              server/db/schema.ts   Drizzle schema      │
│                   server/db/tenant.ts   scoping helpers     │
│                   server/queries.ts     page read models    │
└─────────────────────────────────────────────────────────────┘
```

Rules enforced by review and by lint:

1. **Presentation never computes money.** A page may display `order.totalMinor`; it may not add `qty * price`.
2. **Actions never write to more than one aggregate without a transaction.**
3. **The domain never imports from `app/`.** It is testable with a Postgres URL and nothing else.
4. **Nothing reads `process.env` outside `server/env.ts`.**

---

## 4. The domain model in one picture

```
Organization ─┬─ Membership ── User
              ├─ OrgSettings        (JSONB: terminology, modules, formats, flags)
              ├─ StatusDefinition   (kind: ORDER | EVENT_ITEM …)
              ├─ PaymentMethod
              ├─ Category           (self-referencing: PRODUCT | EXPENSE)
              ├─ CustomFieldDefinition ── CustomFieldValue
              ├─ Customer ─┬─ CustomerPrice ── Product
              │            └─ Order
              ├─ Product ── OrderItem
              ├─ Order ─┬─ OrderItem
              │         ├─ Payment
              │         └─ ActivityEntry
              ├─ Event ── EventProductionItem ── Product
              ├─ Expense ── Attachment
              ├─ AuditLog
              └─ ImportJob
```

`Order → OrderItem` is one-to-many from day one: an order is a basket, never a single product.
`Order → Payment` is one-to-many from day one: "advance paid" is a **derived sum**, not a stored field.

---

## 5. Tenant isolation

Three independent layers, because a leak here ends the product:

1. **Schema.** Every tenant-owned table has a non-null `orgId` with an FK to `Organization`, and every uniqueness constraint that a user perceives (order number, product SKU, category name) is `@@unique([orgId, ...])` — never global.
2. **Runtime.** No query is written by hand at a call site. Reads go through `server/queries.ts` and writes through `server/domain/*`, and both build their `where` clauses with `scope(table, orgId, …)` / `scoped(table, orgId, …)` from `server/db/tenant.ts`, which make the org filter the default rather than something a developer has to remember. Inserts go through `withOrg(orgId, values)`. Single-row fetches end in `mustExist(row)`, which throws 404.
3. **Session.** `requireOrgContext()` resolves the signed session cookie → `User` → `Membership` → `Organization`, and returns `{ user, org, role, config }`. Every page and action starts with it. A user with no membership in the requested org gets a 404, not a 403 (no existence disclosure).

Optional fourth layer for regulated deployments: Postgres RLS policies keyed on `current_setting('app.org_id')`, set per transaction. The migration is included but disabled by default because it doubles local-dev friction.

---

## 6. Request lifecycle — "record a ₹500 payment"

```
Client: PaymentDialog submits Server Action recordPayment(orderId, 50000, methodId, date)
  │
  ├─ requireOrgContext()            → user, org, role, config
  ├─ assert(role can 'payment:create')
  ├─ Zod parse + config-driven required-field check
  ├─ db.transaction:
  │     ├─ load order + items + existing payments
  │     ├─ domain/payments.validatePayment()
  │     │     computes outstanding; applies org's overpayment policy
  │     │       REJECT | ALLOW_CREDIT | FLAG_FOR_REVIEW
  │     ├─ create Payment row
  │     ├─ recompute derived payment status (UNPAID/PARTIAL/PAID/OVERPAID)
  │     ├─ optional auto-advance of order status (config-driven rule)
  │     ├─ ActivityEntry: "₹500 received via UPI"
  │     └─ AuditLog: actor, entity, before → after diff
  ├─ revalidatePath('/orders/[id]'), revalidatePath('/dashboard')
  └─ return { ok, balanceMinor, paymentStatus }
```

The important property: **balance is never stored as a mutable truth.** `balanceMinor = totalMinor − sum(payments)` is computed by one function used by the order page, the customer page, the dashboard, the analytics module, and the CSV export. A denormalised `Order.paidMinor` cache column exists only as a query optimisation, is written exclusively inside that transaction, and has a nightly consistency check that recomputes it from the payment rows.

---

## 7. Configuration architecture (summary; full detail in `03-configuration.md`)

Two storage strategies, chosen deliberately:

- **Relational rows** for anything the user manages as a *list with identity and history*: order statuses, payment methods, product categories, expense categories, custom field definitions. These are referenced by foreign key from transactional data, so renaming "In Progress" to "Being Made" updates every historical order instantly and correctly.
- **A single `OrgSettings.data` JSONB blob** for scalar preferences with no referential meaning: terminology map, module toggles, date/number formats, currency, timezone, feature flags, dashboard widget layout, pricing policy, overpayment policy. Read once per request, validated against a Zod schema with defaults, cached per request.

A **template** is a pure data object (`ConfigSeed`) written to configuration rows once at organization creation by `applyTemplate`. After that moment the organization has no memory of which template it came from, and every value is editable.

---

## 8. What is deliberately *not* in the MVP

Inventory/stock ledger, suppliers, purchase orders, invoices with tax compliance, delivery/courier integration, staff scheduling, multi-branch, payroll, GST filing, automations, notifications, and AI. The schema leaves clean joins for each (documented in `07-mvp-scope.md`), but building them now would trade the one thing that decides success — *does this actually replace her spreadsheet by next month* — for surface area nobody has asked for.
