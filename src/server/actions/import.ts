"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { customers, importJobs, products } from "@/server/db/schema";
import { requireCapability } from "@/server/context";
import { createOrder } from "@/server/domain/orders";
import { createCustomer, createExpense, createProduct } from "@/server/domain/entities";
import { fail } from "./result";
import { MAX_IMPORT_ROWS, readSpreadsheet } from "@/server/spreadsheet";
import { parseSheetAmount, parseSheetDate, parseSheetQuantity } from "@/lib/import-parse";
import {
  suggestMapping,
  type ImportIssue, type ImportResult, type ImportTarget, type SheetPreview,
} from "@/lib/import-fields";

/**
 * Spreadsheet import.
 *
 * The one rule worth stating out loud: "Balance Due" from the sheet is NEVER
 * imported as stored truth. Balance is derived from payment records, so an
 * imported advance becomes a real Payment row and the balance recomputes. That
 * is the only way the app and the old sheet can never silently disagree.
 */

export async function previewSpreadsheetAction(formData: FormData) {
  try {
    await requireCapability("import:run");
    const target = (formData.get("target") as ImportTarget) ?? "orders";
    const file = formData.get("file") as File | null;
    if (!file) return { ok: false as const, error: "Choose a file to upload." };
    if (file.size > 15 * 1024 * 1024) return { ok: false as const, error: "That file is larger than 15 MB." };

    const buffer = Buffer.from(await file.arrayBuffer());
    const sheetName = (formData.get("sheet") as string) || undefined;
    const parsed = readSpreadsheet(buffer, sheetName);
    if (parsed.rows.length === 0) return { ok: false as const, error: "That sheet has no rows." };

    const preview: SheetPreview = { ...parsed, suggested: suggestMapping(target, parsed.columns) };
    return { ok: true as const, data: preview };
  } catch (error) { return fail(error); }
}

export async function runImportAction(args: {
  target: ImportTarget;
  mapping: Record<string, string>;
  rows: Record<string, string>[];
  fileName: string;
  createMissing: boolean;
}) {
  try {
    const ctx = await requireCapability("import:run");
    const { target, mapping } = args;
    // The rows come back from the client, so the reader's cap is re-applied here.
    const rows = args.rows.slice(0, MAX_IMPORT_ROWS);
    const get = (row: Record<string, string>, key: string) => (mapping[key] ? (row[mapping[key]] ?? "").trim() : "");

    const issues: ImportIssue[] = [];
    let created = 0, skipped = 0, createdCustomers = 0, createdProducts = 0;

    const base = { orgId: ctx.org.id, config: ctx.config, actor: ctx.actor };

    const customerCache = new Map<string, string>();
    const productCache = new Map<string, { id: string; priceMinor: number }>();

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2; // +1 header, +1 one-based
      try {
        if (target === "customers") {
          const name = get(row, "name");
          if (!name) { skipped++; issues.push({ row: rowNumber, field: "name", message: "Missing name", severity: "error" }); continue; }
          await createCustomer(base, {
            name, phone: get(row, "phone") || null, email: get(row, "email") || null,
            address: get(row, "address") || null, notes: get(row, "notes") || null,
          });
          created++;
          continue;
        }

        if (target === "products") {
          const name = get(row, "name");
          if (!name) { skipped++; issues.push({ row: rowNumber, field: "name", message: "Missing name", severity: "error" }); continue; }
          const categoryName = get(row, "category");
          const category = ctx.config.productCategories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
          if (categoryName && !category) {
            issues.push({ row: rowNumber, field: "category", message: `Category "${categoryName}" not found — left blank`, severity: "warning" });
          }
          await createProduct(base, {
            name,
            defaultPriceMinor: parseSheetAmount(get(row, "defaultPrice")),
            costMinor: parseSheetAmount(get(row, "cost")) || null,
            categoryId: category?.id ?? null,
            unit: get(row, "unit") || "pcs",
            description: get(row, "description") || null,
          });
          created++;
          continue;
        }

        if (target === "expenses") {
          const description = get(row, "description");
          const amount = parseSheetAmount(get(row, "amount"));
          if (!description) { skipped++; issues.push({ row: rowNumber, field: "description", message: "Missing description", severity: "error" }); continue; }
          if (amount <= 0) { skipped++; issues.push({ row: rowNumber, field: "amount", message: "Amount missing or not a number", severity: "error" }); continue; }

          const categoryName = get(row, "category");
          const category = ctx.config.expenseCategories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
          const methodName = get(row, "method");
          const method = ctx.config.paymentMethods.find(
            (m) => m.label.toLowerCase() === methodName.toLowerCase() || m.key === methodName.toLowerCase(),
          );
          if (methodName && !method) {
            issues.push({ row: rowNumber, field: "method", message: `Payment method "${methodName}" not configured — left blank`, severity: "warning" });
          }

          await createExpense(base, {
            date: parseSheetDate(get(row, "date")),
            description,
            amountMinor: amount,
            categoryId: category?.id ?? null,
            methodId: method?.id ?? null,
            vendor: get(row, "vendor") || null,
          });
          created++;
          continue;
        }

        // ── orders
        const customerName = get(row, "customerName");
        const productName = get(row, "productName");
        if (!customerName) { skipped++; issues.push({ row: rowNumber, field: "customerName", message: "Missing customer", severity: "error" }); continue; }
        if (!productName) { skipped++; issues.push({ row: rowNumber, field: "productName", message: "Missing product", severity: "error" }); continue; }

        // customer
        let customerId = customerCache.get(customerName.toLowerCase());
        if (!customerId) {
          const [found] = await db.select({ id: customers.id }).from(customers)
            .where(and(eq(customers.orgId, ctx.org.id), sql`lower(${customers.name}) = ${customerName.toLowerCase()}`)).limit(1);
          if (found) customerId = found.id;
          else if (args.createMissing) {
            const row2 = await createCustomer(base, { name: customerName, phone: get(row, "phone") || null });
            customerId = row2.id; createdCustomers++;
          } else {
            skipped++;
            issues.push({ row: rowNumber, field: "customerName", message: `Customer "${customerName}" not found`, severity: "error" });
            continue;
          }
          customerCache.set(customerName.toLowerCase(), customerId);
        }

        // product
        let product = productCache.get(productName.toLowerCase());
        if (!product) {
          const [found] = await db.select({ id: products.id, priceMinor: products.defaultPriceMinor }).from(products)
            .where(and(eq(products.orgId, ctx.org.id), sql`lower(${products.name}) = ${productName.toLowerCase()}`)).limit(1);
          if (found) product = { id: found.id, priceMinor: found.priceMinor };
          else if (args.createMissing) {
            const unitFromSheet = parseSheetAmount(get(row, "unitPrice"));
            const row2 = await createProduct(base, { name: productName, defaultPriceMinor: unitFromSheet });
            product = { id: row2.id, priceMinor: row2.defaultPriceMinor }; createdProducts++;
          } else {
            skipped++;
            issues.push({ row: rowNumber, field: "productName", message: `Product "${productName}" not found`, severity: "error" });
            continue;
          }
          productCache.set(productName.toLowerCase(), product);
        }

        const quantity = parseSheetQuantity(get(row, "quantity"));
        let unitPriceMinor: number | null = parseSheetAmount(get(row, "unitPrice")) || null;
        if (!unitPriceMinor) {
          const total = parseSheetAmount(get(row, "totalAmount"));
          if (total > 0) unitPriceMinor = Math.round(total / quantity);
        }

        const statusName = get(row, "status");
        const status = ctx.config.orderStatuses.find(
          (s) => s.label.toLowerCase() === statusName.toLowerCase() || s.key === statusName.toLowerCase().replace(/\s+/g, "_"),
        );
        if (statusName && !status) {
          issues.push({ row: rowNumber, field: "status", message: `Status "${statusName}" not configured — default used`, severity: "warning" });
        }

        const advanceMinor = parseSheetAmount(get(row, "advancePaid"));
        const orderDate = parseSheetDate(get(row, "orderDate"));

        await createOrder({
          ...base,
          source: "import",
          input: {
            customerId,
            orderDate,
            deliveryByDate: mapping.deliveryBy && get(row, "deliveryBy") ? parseSheetDate(get(row, "deliveryBy")) : null,
            statusId: status?.id ?? null,
            note: get(row, "note") || null,
            items: [{ productId: product.id, quantity, unitPriceMinor }],
          },
          // "Balance Due" is deliberately not imported — it is derived from this payment.
          advance: advanceMinor > 0 ? { amountMinor: advanceMinor, methodId: null, paidAt: orderDate } : null,
        });
        created++;
      } catch (error) {
        skipped++;
        issues.push({ row: rowNumber, field: "—", message: error instanceof Error ? error.message : "Could not import this row", severity: "error" });
      }
    }

    await db.insert(importJobs).values({
      orgId: ctx.org.id, fileName: args.fileName, targetEntity: target,
      mapping: mapping as never, status: skipped === rows.length ? "FAILED" : "COMPLETED",
      totalRows: rows.length, successRows: created, errorRows: skipped,
      errors: issues.slice(0, 500) as never,
      summary: { createdCustomers, createdProducts } as never,
      createdByUserId: ctx.actor.userId, completedAt: new Date(),
    });

    for (const p of ["/dashboard", "/orders", "/customers", "/products", "/expenses", "/analytics", "/payments"]) revalidatePath(p);

    const result: ImportResult = { created, skipped, createdCustomers, createdProducts, issues };
    return { ok: true as const, data: result };
  } catch (error) { return fail(error); }
}
