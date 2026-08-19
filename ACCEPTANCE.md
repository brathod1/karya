# Acceptance criteria

The stated bar: *my friend's existing Google Sheet can be replaced by the application.*
Each row names where the capability lives, so any of it can be checked directly.

| # | Criterion | Where | Notes |
|---|---|---|---|
| 1 | Add a customer | `/customers/new`, and inline from the order form | Creating a customer never forces you to abandon an order you're mid-way through |
| 2 | Add a product | `/products/new` | Category, unit, default price, optional cost |
| 3 | Create an order | `/orders/new` | Live totals; advance recorded as a real payment |
| 4 | Set a customer-specific price | Customer page → *Agreed pricing* | Fixed price per product, or a blanket % rule |
| 5 | Add multiple products to one order | Order form → *Add item* | `Order → OrderItem` is one-to-many from day one |
| 6 | Record an advance payment | Order form → *Advance received* | Becomes a `payments` row, not a number on the order |
| 7 | Automatically calculate the balance | Everywhere a balance appears | `total − sum(payments)`, one function, `payments.ts` |
| 8 | Change order status | Orders table, order page, bulk action | Inline dropdown of your configured statuses |
| 9 | Set delivery date | Order form | Plus optional time, requested date, internal deadline |
| 10 | Record additional payments | Any balance badge in the product | One `RecordPaymentSheet`, reachable from five screens |
| 11 | Mark order delivered | Status picker | Any status flagged *counts as completed* |
| 12 | See outstanding balances | Dashboard, `/payments`, customer pages | Including ageing in days |
| 13 | Create an event | `/events/new` | |
| 14 | Add products to an event | Event page → *Add line* | |
| 15 | Set quantity to produce | Production line → *Quantity to make* | |
| 16 | Update quantity completed | `+1` / `−1` steppers on the event page | Works one-handed on a phone while packing |
| 17 | See remaining production | Event page, dashboard | Remaining, %, per-line status, expected revenue |
| 18 | Add expenses | `/expenses/new` | |
| 19 | Categorise expenses | Expense form; categories in Settings | |
| 20 | Track payment method | Expenses and payments | Methods are configuration, not a hardcoded list |
| 21 | See basic sales statistics | `/dashboard`, `/analytics` | |
| 22 | See expense statistics | `/analytics` | By category and over time |
| 23 | Import existing spreadsheet data | `/import` | 4-step wizard, fuzzy column mapping, per-row error report |
| 24 | Configure statuses | `/settings/statuses` | Create, rename, reorder, colour, completed flag, meaning, disable |
| 25 | Configure payment methods | `/settings/payment-methods` | |
| 26 | Configure expense categories | `/settings/categories` | Nestable; archived rather than deleted |
| 27 | Configure custom fields | `/settings/custom-fields` | 10 types across 5 entities |
| 28 | Enable/disable modules | `/settings/modules` | Hides nav *and* 404s the route |
| 29 | Change terminology | `/settings/terminology` | Renames the entire UI; database entities untouched |

## Beyond the 29 criteria

| Capability | Where | Notes |
|---|---|---|
| Receipts and photos | Expense form, product form, order page | Choose the file while adding the record; it uploads the moment the record has an id. Served through an authenticated route with `nosniff` and a CSP sandbox. Magic-byte checked, so a script renamed `.png` is refused. |
| Invite people | Settings → Users | No email is sent and the UI says so: the invitation activates when that person registers with that address. The last owner cannot be demoted or removed. |
| Saved views | Any table → Views | Columns, filters, sort and page size under a name. Personal by default; sharing needs admin. |
| Customer credit | Settings → overpayment policy = Credit | The excess becomes a real ledger entry. Spend it from the payment sheet on any later order. Voiding either half of a credit movement voids the other. |
| Password reset | Settings → Users → Reset, or `npm run reset-password` | An admin issues a single-use link valid for an hour and delivers it themselves. Using it signs that person out everywhere. Only the token's hash is stored. |
| Login throttling | Automatic | Five failed attempts per email and thirty per device per quarter-hour. Counted in the database, so restarts and extra instances don't reset it. |
| Attachments on serverless | `STORAGE_DRIVER=database` | Receipts survive hosts with no persistent disk, and inherit the database's backups. |

## Configurability, proved rather than asserted

The real test isn't the checklist — it's whether a second business can be set up without a code change:

- Pick the **Service** template at signup and the app calls customers *Clients*, products *Services* and orders *Jobs*, with statuses Enquiry → Scheduled → In Progress → Completed.
- Pick **Wholesale** and you get Buyers, SKUs, 18% exclusive tax, 14-day delivery lead time, cost tracking on, and a five-stage production-to-dispatch flow.
- Pick **Retail**, and customer-specific pricing, events and delivery dates all disappear from the forms.

All three run the same components, the same queries, and the same dashboard code. `applyTemplate` writes configuration rows and does nothing else.
