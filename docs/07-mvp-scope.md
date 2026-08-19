# G. MVP Scope

## Must-have — shipped in v1 (the bar: her Google Sheet can be closed)

**Platform** · multi-tenant workspaces · email/password auth · roles · onboarding with templates · tenant-scoped data access · audit log · soft delete everywhere financial.

**Configuration** · terminology · module toggles · order statuses (CRUD, reorder, colour, completed flag, semantic) · payment methods · product & expense categories (nestable) · custom fields (10 types, 6 entities) · field enable/require/label/order · currency · timezone · date & number formats · numbering formats · dashboard widget configuration.

**Orders** · multi-item orders · configurable pricing chain with per-customer prices and per-order override · price snapshots that never move with the product catalogue · discounts and optional charges/tax · delivery dates with upcoming/due-today/overdue states · configurable statuses · three note fields · custom fields · full-featured table (search, filter, sort, column show/hide + reorder, saved views, bulk status change, bulk export) · detail page with activity timeline · duplicate · print view.

**Payments** · real payment records, many per order · methods · references · derived balance and payment status · configurable overpayment policy, including a real customer-credit ledger under the CREDIT policy, and applying that credit to a later order · record-payment from anywhere a balance is shown · refunds/voids (ADMIN+) · "customers who owe you" with ageing.

**Customers** · profile with total purchased, outstanding, order history, payment history, products bought, order frequency · customer-specific price list · tags · custom fields.

**Products** · categories · default price · optional cost · units · active/inactive · images · per-customer price management · sales history.

**Events / Production** · events with dates, location, budget · production plan lines (category, product, planned, completed, unit price) · derived remaining, progress %, expected revenue, per-line status · progress ring and per-category breakdown · inline/stepper completion editing.

**Expenses** · date, description, category, amount, method, vendor, notes · receipt attachments — photograph the bill while adding the expense, served through an authenticated route rather than a public URL · category breakdown.

**Dashboard & analytics** · today's snapshot · needs-attention queue · production progress · top products · expense breakdown · revenue trend · outstanding · revenue/orders/payments/expenses over time · sales by product and category · orders by status · top customers · optional profit (only when cost tracking is on).

**Import/export** · 4-step spreadsheet import with fuzzy column mapping, validation, per-row error reporting, and payment derivation · CSV export from every table, honouring the active search, filters and columns.

## Explicitly deferred — architected for, not built

| Feature | Why deferred | What already exists for it |
|---|---|---|
| Inventory / stock ledger | Not part of the current spreadsheet; would force stock discipline she doesn't have yet | `EventProductionItem` completions and `OrderItem` quantities are the exact inputs a `StockMovement` table needs — additive, no migration of existing rows |
| Suppliers & purchase orders | Expenses cover the real need today | `Expense.vendor` is free text; promoting it to a `Supplier` FK is a backfill |
| Invoices & GST compliance | Genuine compliance is a project, not a feature; a half-correct tax engine is worse than none | Tax fields exist on `Order` and are config-gated off |
| Delivery / courier tracking | Manual dispatch works at this volume | `SHIPMENT`-semantic statuses already model the stage |
| Staff & branches | One-person business | `Membership` roles and `orgId` scoping already generalise |
| Automations & notifications | Needs real usage data to know what's worth alerting on | `ActivityEntry` is the event stream a rules engine would subscribe to |
| AI assistant | Phase 4 | Clean domain layer means an assistant calls the same functions the UI does |
| Recurring orders, quotes, loyalty, multi-currency | No demand signal | — |

## Success test

The MVP is done when the 29 acceptance criteria all pass **and** the crochet business runs a full week — orders, payments, an event, and expenses — without anyone opening the Google Sheet.
