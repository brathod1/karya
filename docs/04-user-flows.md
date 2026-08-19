# D. User Flows

Flows are written as the owner experiences them, with the system effects each one triggers. The system effects are the point — this is a workflow product, not a CRUD form over tables.

---

## Flow 1 — Onboarding a new business (3 steps, under 60 seconds)

```
Sign up (name, email, password)
 └─ Step 1  Business name
 └─ Step 2  Business type  (free text, informational)
 └─ Step 3  Template       Generic · Retail · Handmade/Craft · Service · Wholesale
      ↓
applyTemplate() writes settings, statuses, payment methods, categories
      ↓
Optional: "Import your spreadsheet"  →  Import wizard
Optional: "Load demo data"           →  explore before committing
      ↓
Dashboard
```

Every value chosen here is editable in Settings afterwards. The template is a head start, not a decision.

---

## Flow 2 — Create an order (the single most frequent action; target: under 30 seconds)

```
Quick Add (+) → New Order        [keyboard: N then O]
  1. Customer      combobox, type-ahead; "＋ Create «Priya»" inline if not found
                   → creating a customer never leaves the order form
  2. Line items    product combobox → unit price AUTO-FILLS from the pricing chain
                     order override → customer+product price → customer rule → product default
                   a small caption states which rule applied: "Priya's price · ₹550"
                   the price is editable; editing marks priceSource = ORDER_OVERRIDE
                   "＋ Add item" for multi-product orders
  3. Adjustments   discount (amount or %), additional charges, tax — each shown only if enabled in config
  4. Advance       amount + payment method + date  (optional)
  5. Delivery      delivery-by date (pre-filled today + defaultDeliveryLeadDays), optional time
  6. Notes         order note · internal note · customer-facing note
  7. Custom fields rendered from CustomFieldDefinition(ORDER)
  → Save
```

**System effects, all in one transaction:**
allocate order number → create `Order` → create `OrderItem`s with price snapshots and `priceSource` → compute subtotal/discount/charges/tax/total → create `Payment` if an advance was entered → recompute `paidMinor` + `paymentStatus` → apply default status → write `ActivityEntry` ("Order created", and "₹500 advance received") → write `AuditLog` → revalidate dashboard, orders list, customer page.

A running total sits pinned at the bottom of the form on desktop and in a sticky bar on mobile: **Total ₹1,500 · Advance ₹500 · Balance ₹1,000**, updated as you type.

---

## Flow 3 — Record a payment

```
Anywhere a balance badge appears (orders table, order page, customer page, dashboard)
  → click the balance → Record Payment sheet
      amount (pre-filled with the full outstanding), method, date, reference, note
  → Save
```

**System effects:** validate against outstanding under the org's overpayment policy → create `Payment` → recompute `paidMinor` and `paymentStatus` → optionally auto-advance order status if configured → `ActivityEntry` + `AuditLog` → badge animates red/amber → green.

Overpayment: `REJECT` blocks with the exact outstanding shown; `CREDIT` records the excess as customer credit usable on a future order; `FLAG` (default) accepts and marks the order `OVERPAID` for review. The default is `FLAG` because refusing a payment the owner has physically received is worse than showing her a flag.

---

## Flow 4 — Move an order through production

```
Orders list → status chip → inline dropdown of that org's statuses (ordered, coloured)
   or Order detail → Change status
```
**System effects:** update status → `ActivityEntry` with from → to → `AuditLog` → if the new status `isCompleted`, stamp `completedAt` and drop the order out of "needs attention".
Bulk path: select rows → **Change status** → applies to all, one confirmation, one audit entry per order.

---

## Flow 5 — Plan production for an event

```
Events → New Event  (name, dates, location, notes, optional budget)
  → inside the event: Add production line
        category · product · quantity to make · unit price (defaults from product)
  → as items are made:  quantityCompleted is edited inline, or +1 / −1 steppers on mobile
```
**System effects on every completion edit:** remaining = planned − completed → progress % per line, per category, and for the whole event → derived line status (Not started / In progress / Complete) → expected revenue = planned × unit price → event header progress ring updates → `ActivityEntry`.
Overproduction is blocked unless `settings.events.allowOverproduction` is on, in which case remaining floors at 0 and the line is flagged.

---

## Flow 6 — Log an expense (target: under 15 seconds, usually on a phone)

```
Quick Add (+) → Add Expense
   date (defaults today) · description · category · amount · payment method · vendor · receipt photo
```
**System effects:** allocate expense code → create `Expense` → attach receipt to secure storage → `ActivityEntry` + `AuditLog` → dashboard expense widgets and category breakdown update.

---

## Flow 7 — Import the existing Google Sheet

```
1 Upload      .xlsx / .xls / .csv  (Google Sheets → File → Download → .xlsx)
2 Detect      sheet + header row detected; columns and sample values listed
3 Map         each sheet column → a system field; fuzzy auto-mapping pre-selects the obvious ones
                "Customer Name" → Customer · "Price Per Unit" → Unit price
                "Advance Paid"  → creates a Payment record, not a column
                "Balance Due"   → IGNORED, marked "calculated automatically"
4 Preview     first 20 rows exactly as they will be created
5 Validate    every row checked: missing customers, unparseable dates, negative amounts
6 Fix         errors listed with row numbers; choose per-issue: create missing records, skip, or cancel
7 Import      batched transaction; a partial failure rolls back the batch, never half-writes an order
8 Confirm     "142 orders, 38 customers, 21 products imported · 3 rows skipped" + downloadable error report
```

The refusal to import "Balance Due" as stored truth is deliberate and is stated in the UI: balance is derived from payments, so the imported sheet and the app can never silently disagree.

---

## Flow 8 — Answer the daily questions

| Question the owner actually asks | Where it is answered, in one click |
|---|---|
| What needs to be made? | Dashboard → *Needs attention* → orders in `PRODUCTION` statuses |
| What's due today / overdue? | Dashboard → delivery chips; Orders → filter *Delivery: today / overdue* |
| Who still owes me? | Dashboard → *Outstanding*; Payments → *Customers who owe you* |
| Did Priya pay? | Customer page → balance + full payment history |
| How much have I made this month? | Dashboard → *This month*; Analytics → revenue chart |
| What am I spending on? | Analytics → expenses by category |
| Am I ready for the fest? | Events → progress ring, per-product remaining |
