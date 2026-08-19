import "server-only";
import * as XLSX from "xlsx";

/**
 * The only place the spreadsheet library is touched.
 *
 * Everything else in the import path works with plain rows, so swapping the
 * parser is a change to this file alone — which matters, because the npm
 * registry copy of SheetJS is frozen at a version with published advisories and
 * the maintained build is distributed from the vendor's own CDN.
 */

export type ParsedSheet = {
  sheetNames: string[];
  columns: string[];
  rows: Record<string, string>[];
  totalRows: number;
};

export const MAX_IMPORT_ROWS = 5000;

export function readSpreadsheet(buffer: Buffer, sheetName?: string): ParsedSheet {
  const workbook = XLSX.read(buffer, { cellDates: true });
  const name = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!sheet) {
    throw new Error("That file has no readable sheets.");
  }

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });

  // Google Sheets exports routinely carry unnamed spacer columns; drop them.
  const columns = json.length
    ? Object.keys(json[0]).filter((c) => c && !c.startsWith("__EMPTY")).map((c) => c.trim())
    : [];

  const rows = json
    .slice(0, MAX_IMPORT_ROWS)
    .map((raw) => {
      const out: Record<string, string> = {};
      for (const key of Object.keys(raw)) {
        const trimmed = key.trim();
        if (!trimmed || trimmed.startsWith("__EMPTY")) continue;
        const value = raw[key];
        out[trimmed] = value instanceof Date
          ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
          : String(value ?? "").trim();
      }
      return out;
    })
    // Blank rows in the middle of a sheet are normal and must not become records.
    .filter((row) => Object.values(row).some((v) => v !== ""));

  return { sheetNames: workbook.SheetNames, columns, rows, totalRows: json.length };
}
