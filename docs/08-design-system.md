# H. UI Design System

**Design intent:** a small business owner who lives in Google Sheets should feel *at home in ten seconds and better off in ten minutes*. Familiar density and tabular structure; better hierarchy, states, and feedback.

## Principles

1. **Data first, chrome last.** Type and space carry hierarchy; borders and shadows are used sparingly.
2. **Never colour alone.** Every state is colour **+ label** (+ icon where it helps) — required for accessibility and for the owner's colour-blind cousin who helps at stalls.
3. **Money is typographically special.** Tabular numerals, right-aligned, symbol from config, never wrapped.
4. **Every surface has four designed states:** empty, loading (skeleton matching final layout), error (with retry), and content.
5. **Touch reality.** 44px minimum targets, thumb-reachable primary actions, no hover-only affordances.

## Tokens

```css
/* Neutrals — warm grey, softer than pure slate */
--bg:#FAFAF9  --surface:#FFFFFF  --surface-2:#F5F5F4
--border:#E7E5E4  --border-strong:#D6D3D1
--text:#1C1917  --text-muted:#57534E  --text-subtle:#A8A29E

/* Brand — deep teal: trustworthy, not fintech-cold, distinct from every status colour */
--primary:#0F766E  --primary-hover:#0D5F58  --primary-soft:#CCFBF1  --primary-text:#FFFFFF

/* Semantic */
--success:#059669  --success-soft:#D1FAE5     /* paid, complete */
--warning:#D97706  --warning-soft:#FEF3C7     /* partial, due soon */
--danger:#DC2626   --danger-soft:#FEE2E2      /* unpaid, overdue */
--info:#2563EB     --info-soft:#DBEAFE        /* in transit, informational */
--neutral:#78716C  --neutral-soft:#F5F5F4     /* not started */

--radius:10px  --radius-sm:6px  --radius-lg:14px
--shadow-sm:0 1px 2px rgb(0 0 0/.05)
--shadow-md:0 4px 12px -2px rgb(0 0 0/.08)
--shadow-lg:0 12px 32px -8px rgb(0 0 0/.16)
```

Status colours are stored as **token names** (`emerald`, `amber`, `sky`…), never hex, so user-configured statuses stay inside the palette and dark mode is one mapping table.

## Type

Inter (system fallback) · numerals `font-variant-numeric: tabular-nums` on every money and quantity cell.

| Role | Size / weight |
|---|---|
| Page title | 24px / 600 |
| Section title | 16px / 600 |
| Body | 14px / 400 |
| Table cell | 14px / 400, money 500 |
| Label & caption | 12px / 500, `--text-muted` |
| Metric value | 28px / 650, tabular |

Spacing scale 4/8/12/16/24/32/48. Page gutter 24px desktop, 16px mobile.

## Core components

**Button** — `primary` (filled teal) · `secondary` (white, bordered) · `ghost` · `danger`. Sizes sm/md/lg. Loading state replaces the label with a spinner and locks width so nothing jumps.

**Badge** — soft background + strong text, always with a label.

**BalanceBadge** — the product's signature component and the direct upgrade of the spreadsheet's red/green cells:

```
✓ Paid           emerald soft, "Paid"           (₹0 due)
◐ ₹400 due       amber soft,   "Partially paid"
● ₹1,200 due     red soft,     "Unpaid"
↑ ₹200 over      blue soft,    "Overpaid"
```
Rendered as a button everywhere: clicking opens the Record Payment sheet. Screen readers announce the full phrase, not the colour.

**StatusChip** — dot + label in the org's configured colour; on the orders table it is a dropdown that changes status inline.

**DeliveryChip** — `● Due today` (red) · `● Due in 2 days` (amber) · `Due 24 Aug` (neutral) · `✓ Delivered` (green). The amber threshold comes from `settings.orders.dueSoonDays`.

**DataTable** — sticky header, zebra-free with hairline rows, sortable headers, per-column filters, global search, column show/hide, saved views (personal or shared), row selection with a bulk action bar that slides up, pagination with page-size control, CSV export of exactly what is on screen, and per-row keyboard navigation. Collapses to cards below 768px. Column set and visibility are configuration, not code.

**MetricCard** — label, big tabular value, delta vs previous period with direction arrow, optional sparkline.

**ProgressRing / ProgressBar** — used for event production; always paired with `72 / 120` text.

**Forms** — label above input, help text below, inline error in red with an icon, required marked with `*`. Money inputs show the currency symbol as a prefix affix and accept `1,250` or `1250`. Date inputs default sensibly (today, today + lead days). Comboboxes support create-on-the-fly.

**Sheet / Dialog** — dialogs for confirmations, right-side sheets on desktop and bottom sheets on mobile for record-payment and quick edits, so the underlying context stays visible.

**AttachmentPanel** — thumbnail list with add and remove. Files chosen before a record exists are held and uploaded the moment it has an id, so a receipt can be photographed while the expense is being typed rather than afterwards.

**Toast** — bottom-right desktop, top mobile; success toasts carry an Undo where the action is reversible.

## Empty states

Never a bare "No data." Each is an icon, a sentence in the org's own terminology, and the primary action:

> **No orders yet**
> Create your first order, or import your spreadsheet to bring existing ones in.
> [ New Order ] [ Import spreadsheet ]

## Accessibility

WCAG 2.1 AA contrast on all text and on soft-background badges · visible focus rings (2px, `--primary`) · full keyboard operation including the data table and command palette · form errors linked with `aria-describedby` · live regions for balance and progress updates · `prefers-reduced-motion` respected.

## Motion

150ms ease-out for hovers and chips, 200ms for sheets and dialogs, 400ms for progress rings. Nothing decorative moves.
