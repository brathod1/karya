import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readSpreadsheet } from "./spreadsheet";
import { suggestMapping } from "@/lib/import-fields";

/**
 * The fixture is a real .xlsx written by a completely different toolchain
 * (Python/openpyxl), shaped like an actual Google Sheets export of the crochet
 * order sheet: trailing spaces in headers, a blank row in the middle,
 * dd/mm/yyyy text dates, currency symbols, and a missing product.
 */
const file = readFileSync("src/server/__fixtures__/sample-orders.xlsx");

describe("reading a real spreadsheet", () => {
  it("finds every sheet", () => {
    expect(readSpreadsheet(file).sheetNames).toEqual(["Orders", "Expenses"]);
  });

  it("reads the headers and trims the stray spaces sheets always contain", () => {
    const { columns } = readSpreadsheet(file);
    expect(columns).toContain("Customer");        // header was "Customer " in the file
    expect(columns).toContain("Price Per Unit");
    expect(columns).toContain("Balance Due");
  });

  it("drops the blank row rather than importing an empty order", () => {
    const { rows } = readSpreadsheet(file);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => Object.values(r).some((v) => v !== ""))).toBe(true);
  });

  it("keeps cell values as written, symbols and all, for the parser to handle", () => {
    const { rows } = readSpreadsheet(file);
    expect(rows[0]["Customer Name"]).toBe("Priya Shah");
    expect(rows[0]["Price Per Unit"]).toBe("₹500");
    expect(rows[2]["Total Amount"]).toBe("2,500");
  });

  it("reads a named second sheet", () => {
    const { columns, rows } = readSpreadsheet(file, "Expenses");
    expect(columns).toContain("Item Purchased");
    expect(rows[0]["Amount"]).toBe("₹2,400");
  });
});

describe("auto-mapping the crochet sheet's real column names", () => {
  const { columns } = readSpreadsheet(file);
  const mapping = suggestMapping("orders", columns);

  it("maps the columns a person would map by hand", () => {
    expect(mapping.customerName).toBe("Customer Name");
    expect(mapping.productName).toBe("Product Name");
    expect(mapping.quantity).toBe("Quantity");
    expect(mapping.unitPrice).toBe("Price Per Unit");
    expect(mapping.advancePaid).toBe("Advance Paid");
    expect(mapping.status).toBe("Order Status");
    expect(mapping.deliveryBy).toBe("Delivery By Date");
    expect(mapping.note).toBe("Note");
  });

  it("never offers Balance Due as a target — it is derived from payments", () => {
    expect(Object.values(mapping)).not.toContain("Balance Due");
  });
});
