/**
 * Import field catalogue. Deliberately NOT in the "use server" module —
 * a server-action file may only export async functions.
 */
export type ImportTarget = "orders" | "customers" | "products" | "expenses";

export type ImportFieldDef = { key: string; label: string; required?: boolean; note?: string };

export type SheetPreview = {
  sheetNames: string[];
  columns: string[];
  rows: Record<string, string>[];
  totalRows: number;
  suggested: Record<string, string>;
};

export type ImportIssue = { row: number; field: string; message: string; severity: "error" | "warning" };

export type ImportResult = {
  created: number;
  skipped: number;
  createdCustomers: number;
  createdProducts: number;
  issues: ImportIssue[];
};

export const IMPORT_FIELDS: Record<ImportTarget, ImportFieldDef[]> = {
  orders: [
    { key: "customerName", label: "Customer name", required: true },
    { key: "orderDate", label: "Order date" },
    { key: "productName", label: "Product name", required: true },
    { key: "quantity", label: "Quantity" },
    { key: "unitPrice", label: "Price per unit" },
    { key: "totalAmount", label: "Total amount", note: "Only used when there is no unit price" },
    { key: "advancePaid", label: "Advance paid", note: "Becomes a payment record" },
    { key: "status", label: "Order status", note: "Matched against your configured statuses" },
    { key: "deliveryBy", label: "Delivery by date" },
    { key: "note", label: "Note" },
    { key: "phone", label: "Customer phone" },
  ],
  customers: [
    { key: "name", label: "Name", required: true },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address" },
    { key: "notes", label: "Notes" },
  ],
  products: [
    { key: "name", label: "Name", required: true },
    { key: "defaultPrice", label: "Default price" },
    { key: "category", label: "Category" },
    { key: "unit", label: "Unit" },
    { key: "cost", label: "Cost" },
    { key: "description", label: "Description" },
  ],
  expenses: [
    { key: "date", label: "Date", required: true },
    { key: "description", label: "Item purchased", required: true },
    { key: "amount", label: "Amount", required: true },
    { key: "category", label: "Category" },
    { key: "method", label: "Payment method" },
    { key: "vendor", label: "Vendor" },
  ],
};

/**
 * Fuzzy column matching, so the common Google Sheets headers map themselves.
 *
 * Hints are listed MOST SPECIFIC FIRST and matched in that order — "customer
 * name" must win over "customer", or the sheet's customer-ID column gets picked
 * as the customer's name. Bare ambiguous words are deliberately absent: "due"
 * used to be a hint for the delivery date, which silently claimed "Balance Due".
 */
const HINTS: Record<string, string[]> = {
  customerName: ["customer name", "client name", "buyer name", "customer", "client", "buyer", "name"],
  orderDate: ["order date", "date of order", "date", "created", "booked on"],
  productName: ["product name", "item name", "product", "item", "description of item"],
  quantity: ["quantity", "qty", "nos", "pcs", "count"],
  unitPrice: ["price per unit", "price per quantity", "unit price", "rate per unit", "rate", "price each", "price"],
  totalAmount: ["total amount", "total value", "order total", "total", "amount"],
  advancePaid: ["advance paid", "advance received", "advance", "amount paid", "paid"],
  status: ["order status", "status", "stage"],
  deliveryBy: ["delivery by date", "delivery date", "delivery by", "deliver by", "due date", "delivery"],
  note: ["note", "notes", "remark", "remarks", "comment", "comments"],
  phone: ["phone number", "mobile number", "contact number", "whatsapp", "phone", "mobile", "contact"],
  name: ["name", "product name", "customer name", "item name", "title"],
  email: ["email address", "email", "e mail", "mail"],
  address: ["address", "location", "city"],
  notes: ["notes", "note", "remark", "remarks"],
  defaultPrice: ["default price", "selling price", "unit price", "price", "rate", "mrp"],
  category: ["category", "type", "group"],
  unit: ["unit", "uom", "measure"],
  cost: ["cost price", "purchase price", "cost", "buying price"],
  description: ["item purchased", "description", "particulars", "details", "desc", "spent on"],
  date: ["expense date", "date", "purchased on", "spent on"],
  amount: ["amount", "total amount", "value", "total"],
  method: ["payment method", "payment mode", "cash online", "mode", "paid by", "method"],
  vendor: ["vendor", "supplier", "shop", "purchased from", "from"],
};

/**
 * Columns that must never be auto-mapped, however well they match.
 *
 * A balance is derived from payment records; importing a stored one guarantees
 * the app and the old sheet can disagree the moment anything changes.
 */
const NEVER_MAP = ["balance", "balance due", "outstanding", "amount due", "remaining", "pending amount"];

function normalise(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Whole-phrase containment, so "serial number" does not match the hint "number". */
function containsPhrase(haystack: string, phrase: string) {
  return new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(haystack);
}

export function suggestMapping(target: ImportTarget, columns: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();

  const candidates = columns
    .map((raw) => ({ raw, norm: normalise(raw) }))
    .filter((c) => !NEVER_MAP.some((banned) => c.norm === banned || containsPhrase(c.norm, banned)));

  for (const field of IMPORT_FIELDS[target]) {
    const hints = HINTS[field.key] ?? [normalise(field.key)];

    // Exact header match, most specific hint first.
    let match = null as { raw: string } | null;
    for (const hint of hints) {
      const found = candidates.find((c) => !used.has(c.raw) && c.norm === hint);
      if (found) { match = found; break; }
    }

    // Then whole-phrase containment, again most specific hint first.
    if (!match) {
      for (const hint of hints) {
        const found = candidates.find((c) => !used.has(c.raw) && containsPhrase(c.norm, hint));
        if (found) { match = found; break; }
      }
    }

    if (match) { out[field.key] = match.raw; used.add(match.raw); }
  }
  return out;
}
