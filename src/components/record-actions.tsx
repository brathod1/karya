"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";
import { ConfirmDialog, Sheet } from "./ui/sheet";
import { useToast } from "./ui/toast";
import { useConfig } from "./config-provider";
import { checkDeletableAction, deleteRecordAction, setArchivedAction } from "@/server/actions/entities";

export type RecordKind = "CUSTOMER" | "PRODUCT" | "EXPENSE" | "EVENT";

/**
 * One menu for archiving, restoring and deleting any record.
 *
 * Archive is offered first and described plainly, because it is almost always
 * the right choice. Permanent deletion asks you to type the record's name back,
 * and refuses outright when something else still depends on it.
 */
export function RecordActions({ kind, id, label, archived, returnTo, noun }: {
  kind: RecordKind;
  id: string;
  /** Shown in the dialogs, and what must be typed to confirm a deletion. */
  label: string;
  archived: boolean;
  /** Where to go after the record ceases to exist. */
  returnTo: string;
  noun: string;
}) {
  const { can } = useConfig();
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [blocker, setBlocker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!can("record:archive")) return null;

  async function setArchived(next: boolean) {
    setBusy(true);
    const result = await setArchivedAction(kind, id, next);
    setBusy(false);
    setArchiveOpen(false);
    if (!result.ok) { toast.push(result.error, "error"); return; }
    toast.push(next ? "Archived" : "Restored");
    if (next) router.push(returnTo);
    router.refresh();
  }

  return (
    <>
      <div className="relative">
        <Button size="sm" variant="secondary" aria-label="More actions" onClick={() => setOpen((v) => !v)}>
          <MoreHorizontal className="size-4" />
        </Button>

        {open ? (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg bg-white p-1 shadow-lg ring-1 ring-line animate-in">
              {archived ? (
                <button type="button" onClick={() => { setOpen(false); setArchived(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-stone-100">
                  <RotateCcw className="size-3.5" />Restore
                </button>
              ) : (
                <button type="button" onClick={() => { setOpen(false); setArchiveOpen(true); }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-stone-100">
                  <Archive className="size-3.5" />Archive
                </button>
              )}

              {can("record:delete") ? (
                <button
                  type="button"
                  onClick={async () => {
                    setOpen(false);
                    setConfirmation("");
                    setBlocker(null);
                    setDeleteOpen(true);
                    const check = await checkDeletableAction(kind, id);
                    if (check.ok && !check.data.deletable) setBlocker(check.data.reason);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="size-3.5" />Delete permanently
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={archiveOpen} onClose={() => setArchiveOpen(false)} loading={busy}
        title={`Archive ${label}?`}
        message={`It disappears from your lists and stops appearing in pickers, but nothing is lost — the record and everything linked to it stay, and you can restore it at any time.`}
        confirmLabel="Archive"
        onConfirm={() => setArchived(true)}
      />

      <Sheet
        open={deleteOpen} onClose={() => setDeleteOpen(false)} width="sm"
        title="Delete permanently"
        description={`${label} — this cannot be undone`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="danger" loading={busy}
              disabled={!!blocker || confirmation.trim().toLowerCase() !== label.trim().toLowerCase()}
              onClick={async () => {
                setBusy(true);
                const result = await deleteRecordAction(kind, id, confirmation, label);
                setBusy(false);
                if (!result.ok) { toast.push(result.error, "error"); return; }
                setDeleteOpen(false);
                toast.push(`${result.data.label} deleted`);
                router.push(returnTo);
                router.refresh();
              }}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {blocker ? (
            <>
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">
                {blocker}
              </p>
              <Button variant="secondary" className="w-full" onClick={() => { setDeleteOpen(false); setArchiveOpen(true); }}>
                Archive instead
              </Button>
            </>
          ) : (
            <>
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
                This removes the {noun} and anything that only belongs to it, for good.
                If it has any real history, archive it instead.
              </p>
              <p className="text-[13px] text-ink-muted">
                A record of the deletion stays in the audit log.
              </p>
              <Field label={`Type ${label} to confirm`}>
                <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={label} autoFocus autoComplete="off" />
              </Field>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
