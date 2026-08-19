# I. Implementation Plan

Nine stages. Each is independently reviewable and leaves the app working.

| # | Stage | Contents | Exit criteria |
|---|---|---|---|
| 0 | **Foundation** | Next.js 15 + TS + Tailwind v4 scaffold, Drizzle + `pg`, env validation, `Money` module, formatting utilities | `npm run dev` boots; `tsc --noEmit` clean |
| 1 | **Data & tenancy** | Full Drizzle schema, generated migrations, check constraints, indexes, tenant scoping helpers, session auth, `requireOrgContext`, roles | A second org's data is unreachable by construction; auth round-trips |
| 2 | **Configuration core** | `OrgSettings` Zod schema + defaults, `getOrgConfig`, terminology `t()`, module gating, status/method/category/custom-field CRUD, templates, numbering | Changing terminology renames the entire UI; disabling a module removes nav *and* route |
| 3 | **Design system** | Tokens, primitives, `DataTable`, `BalanceBadge`, `StatusChip`, `DeliveryChip`, `MetricCard`, sheets, toasts, app shell, Quick Add | Component gallery renders; mobile shell verified |
| 4 | **Orders & payments** | Pricing engine, order create/edit transaction, order table + detail + timeline, payment recording, balance derivation, overpayment policy, bulk actions | Acceptance criteria 1–12 pass |
| 5 | **Customers & products** | Profiles with derived stats, customer-price management, product catalogue and categories, sales history | Criteria 4, 5 verified through the UI |
| 6 | **Events & expenses** | Event CRUD, production plan with derived progress, expense CRUD, attachments | Criteria 13–20 pass |
| 7 | **Dashboard, analytics, import** | Widget system, all aggregates in `domain/analytics`, charts, 4-step import wizard, exports | Criteria 21–23 pass; a real sheet imports end-to-end |
| 8 | **Settings, audit, polish** | All settings screens, audit log viewer, saved views, empty/loading/error passes, a11y sweep, seed demo data | Criteria 24–29 pass; Lighthouse a11y ≥ 95 |

**Testing.** Unit tests on the domain layer are non-negotiable — pricing resolution, order totals with discount/charges/tax, balance and payment status, overpayment branches, event progress and rounding, numbering allocation under concurrency. Integration tests on the transactional actions. One end-to-end path: create customer → product → customer price → multi-item order → advance → status changes → final payment → delivered.

**Sequencing rationale.** Configuration (stage 2) precedes every feature deliberately: if the modules are built first, configurability gets retrofitted, and retrofitted configurability is always fake. Similarly the pricing engine lands before any order UI, so no screen ever has an excuse to compute a price itself.

**Deployment.** Vercel or any Node host + managed Postgres (Neon, Supabase, RDS). `drizzle-kit migrate` in the release step. Nightly job: recompute `Order.paidMinor` from payment rows and alert on any divergence — a cheap, permanent check that the cache never lies.
