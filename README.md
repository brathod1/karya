# Karya

A configurable operations platform for small businesses — orders, payments, production planning and expenses — built to replace the spreadsheet a business actually runs on.

The first real user is a crochet business. Nothing about crochet is hardcoded: it is simply the first template.

> **The rule this codebase is built around:** the workflow is configuration, the platform is reusable.
> There is no `if (businessType === "crochet")` anywhere. If you're tempted to add one, add a configuration key instead.

---

## Run it

**You need:** Node 20+ and a PostgreSQL 14+ database (local, Neon, Supabase, RDS — any of them).

```bash
npm install

cp .env.example .env
#   DATABASE_URL  → your Postgres connection string
#   AUTH_SECRET   → any random string of 32+ characters
#                   (macOS/Linux: openssl rand -base64 36)

npm run db:push     # create the tables
npm run dev         # http://localhost:3000
```

Open http://localhost:3000, **create an account**, and pick a template in onboarding.

If you want something to look at rather than an empty workspace, `npm run db:seed`
loads a demo crochet business — 11 orders across 6 customers, 10 products,
per-customer pricing (the same plushie at ₹500, ₹550 and ₹650 for three different
customers), two events with a live production plan, and a month of expenses. It
refuses to run against a database that already contains real accounts.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Domain unit tests (pricing, balances, credit, production, money, dates, uploads, throttling) |
| `npm run db:push` | Sync the schema straight to the database (development) |
| `npm run db:generate` | Emit a reviewable SQL migration into `drizzle/` |
| `npm run db:migrate` | Apply migrations (production) |
| `npm run db:studio` | Browse the data |
| `npm run db:seed` | Load the optional demo workspace (refuses if real accounts exist) |
| `npm run db:reconcile` | Recompute every order's paid total from its payment rows and correct any drift (run nightly; exits non-zero if it had to fix anything) |
| `npm run reset-password -- someone@example.com` | Print a single-use password-reset link. The last resort for an owner who is locked out |

---

## Upgrading an existing install

```bash
npm install      # the spreadsheet library moved to the vendor's own distribution
npm run db:push  # adds the credit link, login throttling and password-reset tables
npm run dev
```

To put it online for someone else to use, see **[DEPLOY.md](DEPLOY.md)**.

## Where things live

```
docs/                      Architecture, schema, configuration, flows, screens,
                           permissions, scope, design system, plan  (read these first)

src/lib/                   Pure, shared, no I/O
  money.ts                 Integer minor units. The only money arithmetic in the codebase.
  settings.ts              The full configuration schema, with defaults
  permissions.ts           Roles → capabilities
  import-fields.ts         Spreadsheet column catalogue + fuzzy auto-mapping

src/server/
  db/schema.ts             The database, in TypeScript
  db/tenant.ts             scope() / scoped() / withOrg() — tenant isolation helpers
  context.ts               requireOrgContext / requireCapability / requireModule
  queries.ts               Read models for pages
  domain/                  All business logic
    pricing.ts             Price resolution chain + order totals
    payments.ts            Balance, payment status, overpayment policy
    events.ts              Production progress
    orders.ts              Order and payment workflows (transactional)
    entities.ts            Customers, products, expenses, events
    analytics.ts           Every dashboard and report figure
    config.ts              Resolve an organisation's configuration
    templates.ts           Business templates — data only
    numbering.ts           ORD-2026-0042 style identifiers
    audit.ts               Activity timeline + append-only audit log
  actions/                 Server Actions: auth → validate → call domain → revalidate

src/components/            Design system and shared UI
src/app/(app)/             The application
```

---

## The five ideas worth knowing before you change anything

**1. Money is integer minor units.** Paise, cents — never a float, never a string. `src/lib/money.ts` is the only place arithmetic on money happens. `toMinor("1,250.50") === 125050`.

**2. Balance is derived, never stored as truth.** An order has many `payments`. `balance = total − sum(payments)`. "Advance paid" is a sum, not a field somebody types. This is why multiple payments, mixed methods, refunds and reporting all work — and why the spreadsheet import deliberately refuses to import a "Balance Due" column.

**3. Prices are snapshots.** `order_items.unit_price_minor` and `product_name_snapshot` are written once and never touched again. Changing a product's price or name tomorrow leaves every past order exactly as it was sold. The resolution chain — order override → customer+product price → customer rule → catalogue price — lives in `pricing.ts` and nowhere else. The order form calls the same function the server calls on save, so the price you see is the price you get.

**4. Statuses are configurable but still meaningful.** Each status carries a `semantic` (`PRODUCTION`, `SHIPMENT`, `COMPLETION`, `CANCELLED`). The dashboard asks for "orders in production" by *meaning*, never by label. That is what lets a print shop rename everything to New → Designing → Printing → Packed → Collected and get a correct dashboard with zero code changes.

**5. Nothing financial is deleted.** Archive, deactivate, void. A discontinued product still resolves on a two-year-old order; a voided payment stays visible and marked. The audit log is append-only and the application has no path that updates or deletes a row in it.

---

## What is deliberately not here

Inventory, suppliers, invoices with tax compliance, courier tracking, staff scheduling, multi-branch, payroll, automations, notifications, AI. `docs/07-mvp-scope.md` explains what already exists in the schema for each of them, and why building them now would have cost the thing that actually decides success: whether one real business can close its spreadsheet next month.

---

## Verification status

- `npm run typecheck` — clean
- `npm run build` — 36 routes compile
- `npm test` — 85 tests: the pricing chain; order totals with discount, charges and inclusive/exclusive tax; balance derivation with refunds and voids; all three overpayment policies; the customer-credit ledger; production progress and overproduction; money parsing, formatting and rounding; calendar-date bounds against a Postgres `date` column; numbering formats; spreadsheet reading against a real `.xlsx` fixture written by a different toolchain; upload safety (path traversal, magic-byte sniffing, header injection); and login throttling windows
- Two independent audit passes checked the invariants above and the tenant scoping of every query. Everything found is fixed, notably: an invalid `NOT IN` predicate in the analytics filter; missing ownership checks on client-supplied ids; a live-total preview that mirrored the pricing engine instead of calling it; `redirect()` being swallowed by every action's `catch`, so an expired session showed a toast reading `NEXT_REDIRECT`; a credit split that could write a zero-amount payment and violate a database check constraint; and a non-Latin-1 filename returning 500 from the attachment route

Three further defects were found only by using the running app, and are worth naming because no amount of typechecking would have caught them: every colour class silently compiling to nothing under Tailwind v4, a timezone off-by-one that made "today" include yesterday, and a nested `<button>` that broke hydration on mobile widths.

Database-dependent paths (migrations, seed, and the end-to-end flows) need a live Postgres; run `npm run db:push && npm run db:seed` to exercise them.
