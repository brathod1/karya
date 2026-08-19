"use client";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import type { BulkAction } from "./data-table";
import { bulkDeleteRecordsAction, bulkSetArchivedAction } from "@/server/actions/entities";
import type { RecordKind } from "./record-actions";

/**
 * The archive / restore / delete bulk actions shared by every record list.
 *
 * Bulk deletion removes what it can and reports what it could not, rather than
 * abandoning the whole batch at the first record something depends on — the
 * point of it is tidying up a pile of duplicates.
 */
export function recordBulkActions<T extends { id: string }>(args: {
  kind: RecordKind;
  archived: boolean;
  canArchive: boolean;
  canDelete: boolean;
  onDone: () => void;
  notify: (message: string, tone?: "success" | "error" | "info") => void;
}): BulkAction<T>[] {
  const actions: BulkAction<T>[] = [];

  if (args.canArchive) {
    actions.push({
      label: args.archived ? "Restore" : "Archive",
      icon: args.archived ? RotateCcw : Archive,
      run: async (rows) => {
        const result = await bulkSetArchivedAction(args.kind, rows.map((r) => r.id), !args.archived);
        if (!result.ok) { args.notify(result.error, "error"); return; }
        args.notify(`${result.data.count} ${args.archived ? "restored" : "archived"}`);
        args.onDone();
      },
    });
  }

  if (args.canDelete) {
    actions.push({
      label: "Delete",
      icon: Trash2,
      danger: true,
      run: async (rows) => {
        const result = await bulkDeleteRecordsAction(args.kind, rows.map((r) => r.id));
        if (!result.ok) { args.notify(result.error, "error"); return; }

        const { deleted, skipped, firstReason } = result.data;
        if (deleted > 0) args.notify(`${deleted} deleted${skipped ? `, ${skipped} kept` : ""}`);
        if (skipped > 0) args.notify(firstReason ?? "Some records could not be deleted", "info");
        args.onDone();
      },
    });
  }

  return actions;
}
