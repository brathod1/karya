# E. Page / Screen Map (MVP)

Routes marked **[module]** render only when that module is enabled in `config.modules`; otherwise the route returns 404 and the nav item is absent.

```
/login                              Email + password
/register                           Create account
/onboarding                         3-step: business name → type → template (+ demo data, + import)

/                                   → redirects to /dashboard

/dashboard                          Configurable widget grid
   Today (orders · sales · collected · outstanding · expenses)
   Orders needing attention (in production · due today · overdue · payments pending)
   Production progress (next event, ring + per-product bars)
   Top products · Expenses by category · Revenue trend · Outstanding balances
   Recent activity

/orders                       [orders]      DataTable: search · filters · sort · column config · saved views · bulk actions · export
/orders/new                   [orders]      Multi-item order form with live totals
/orders/[id]                  [orders]      Detail: header · items · payments · notes · custom fields · attachments · timeline
/orders/[id]/edit             [orders]      Same form, pre-filled

/customers                    [customers]   DataTable: name · phone · orders · total purchased · outstanding · last order
/customers/new  /customers/[id]/edit
/customers/[id]               [customers]   Profile: stats · orders · payment history · products bought · agreed prices

/products                     [products]    DataTable/grid: name · category · default price · cost* · unit · active
/products/new  /products/[id]/edit
/products/[id]                [products]    Detail: pricing (default + per-customer) · sales history · event usage

/events                       [events]      Cards: name · dates · progress ring · expected revenue
/events/new  /events/[id]/edit
/events/[id]                  [events]      Production plan table (inline editable) · progress by category · revenue summary

/expenses                     [expenses]    DataTable: date · description · category · amount · method · receipt
/expenses/new  /expenses/[id]/edit

/payments                     [payments]    Two tabs: All payments · Customers who owe you (ageing by days outstanding)

/analytics                    [analytics]   Revenue over time · orders over time · payments received · outstanding
                                            orders by status · sales by product · sales by category · top customers
                                            expenses over time · expenses by category · event production progress
                                            (+ estimated profit, only when cost tracking is enabled)

/import                                     4-step wizard: upload → map columns → preview & check → import
                                            (fuzzy auto-mapping; per-row error report at the end)
/import/[jobId]                             Result + downloadable error report

/settings                                   Settings shell (left sub-nav)
/settings/business                          Name · logo · currency · timezone · date & number format
/settings/users                             Members · roles · invitations
/settings/terminology                       Customer / Product / Order / Event / Expense labels, with live preview
/settings/statuses                          Order statuses: create · rename · reorder (drag) · colour · completed flag · semantic · disable
/settings/payment-methods                   List CRUD + reorder
/settings/categories                        Product & expense categories, nestable
/settings/custom-fields                     Per entity: add field · type · options · required · show in table · order
/settings/modules                           Toggle modules on/off
/settings/dashboard                         Enable/disable/reorder widgets, set ranges
/settings/numbering                         Prefix · pattern · next value · reset policy per entity
/settings/import-export                     Import history · CSV export from any table
/settings/audit-log                         Filterable, read-only audit trail

/api/attachments/[id]                       Auth-checked file streaming (never a public bucket URL)

(Export happens in the browser from the rows already loaded, so it honours the
 active search, filters and column choices exactly as displayed. There is no
 server export endpoint; CSV only.)
```

## Cross-cutting UI

- **App shell** — sidebar (desktop, collapsible) / bottom tab bar + drawer (mobile), driven entirely by `config.modules` and `t()`.
- **Quick Add (+)** — floating on mobile, header button + `⌘K` on desktop: New Order · New Customer · New Product · Record Payment · Add Expense · New Event (filtered by enabled modules).
- **Command palette** — `⌘K` jumps to any order number, customer, or product.
- **Record Payment sheet** — one component reachable from every balance badge in the product.
- **States** — every list has a designed empty state with a primary action, a skeleton loading state matching final layout, and an error state with retry. No spinners on full pages.

## Mobile adaptations

Tables become cards with the three most important fields plus a status chip. The order form becomes a single scrolling column with a sticky total bar. Inline edits become bottom sheets. Event production uses `+1 / −1` steppers so completions can be logged while packing.
