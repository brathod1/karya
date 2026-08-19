"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";
import { cn } from "@/lib/cn";
import {
  deleteAttachmentAction, listAttachmentsAction, uploadAttachmentAction, type AttachmentView,
} from "@/server/actions/attachments";
import { compressImage } from "@/lib/compress-in-browser";
import { describeSaving } from "@/lib/image-compression";

type EntityType = "ORDER" | "CUSTOMER" | "PRODUCT" | "EXPENSE" | "EVENT";

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Attaching files to something that does not exist yet is a real workflow —
 * you photograph the bill while adding the expense. When `entityId` is null the
 * panel holds the files in memory and the parent form uploads them once the
 * record has an id (see `uploadPendingFiles`).
 */
export function AttachmentPanel({ entityType, entityId, pending, onPendingChange, label = "Attachments", help, canEdit = true }: {
  entityType: EntityType;
  entityId: string | null;
  pending?: File[];
  onPendingChange?: (files: File[]) => void;
  label?: string;
  help?: string;
  canEdit?: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AttachmentView[]>([]);
  const [loading, setLoading] = useState(!!entityId);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const result = await listAttachmentsAction(entityType, entityId);
      if (!cancelled) {
        if (result.ok) setItems(result.data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setSaving(null);

    // Shrink photographs before they leave the device: far quicker on a patchy
    // connection, and a fraction of the storage.
    const prepared: File[] = [];
    let sizeBefore = 0;
    let sizeAfter = 0;
    for (const original of Array.from(files)) {
      const { file, originalSize } = await compressImage(original);
      if (file.size < originalSize) { sizeBefore += originalSize; sizeAfter += file.size; }
      prepared.push(file);
    }
    if (sizeBefore > 0) setSaving(describeSaving(sizeBefore, sizeAfter));

    if (!entityId) {
      onPendingChange?.([...(pending ?? []), ...prepared]);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    for (const file of prepared) {
      const form = new FormData();
      form.set("entityType", entityType);
      form.set("entityId", entityId);
      form.set("file", file);
      const result = await uploadAttachmentAction(form);
      if (result.ok) setItems((prev) => [...prev, result.data]);
      else toast.push(result.error, "error");
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-muted">
          {label}
          {saving ? <span className="ml-2 text-[11.5px] font-normal text-emerald-700">compressed {saving}</span> : null}
        </p>
        {canEdit ? (
          <Button type="button" variant="ghost" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="size-3.5" />Add file
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef} type="file" multiple className="sr-only"
        accept="image/png,image/jpeg,image/webp,image/gif,image/heic,application/pdf"
        onChange={(e) => onFiles(e.target.files)}
      />

      {loading ? (
        <p className="flex items-center gap-2 text-[13px] text-ink-subtle"><Loader2 className="size-3.5 animate-spin" />Loading…</p>
      ) : items.length === 0 && (pending ?? []).length === 0 ? (
        <button
          type="button" disabled={!canEdit} onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong bg-stone-50 px-4 py-6 text-center",
            canEdit && "hover:bg-stone-100",
          )}
        >
          <Paperclip className="size-4 text-ink-subtle" />
          <span className="text-[12.5px] text-ink-muted">{help ?? "Attach a photo or PDF"}</span>
        </button>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5 rounded-lg bg-stone-50 px-2.5 py-2 ring-1 ring-line">
              {item.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="size-9 rounded object-cover ring-1 ring-line" />
              ) : (
                <span className="grid size-9 place-items-center rounded bg-white ring-1 ring-line"><FileText className="size-4 text-ink-subtle" /></span>
              )}
              <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] hover:underline">
                {item.fileName}
                <span className="ml-2 text-[11.5px] text-ink-subtle tabular">{readableSize(item.sizeBytes)}</span>
              </a>
              {canEdit ? (
                <Button
                  type="button" variant="ghost" size="icon" aria-label={`Remove ${item.fileName}`}
                  onClick={async () => {
                    const result = await deleteAttachmentAction(item.id);
                    if (result.ok) setItems((prev) => prev.filter((x) => x.id !== item.id));
                    else toast.push(result.error, "error");
                  }}
                >
                  <Trash2 className="size-3.5 text-ink-subtle" />
                </Button>
              ) : null}
            </li>
          ))}

          {(pending ?? []).map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-2.5 rounded-lg bg-amber-50 px-2.5 py-2 ring-1 ring-amber-200">
              <span className="grid size-9 place-items-center rounded bg-white ring-1 ring-line"><Paperclip className="size-4 text-ink-subtle" /></span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {file.name}
                <span className="ml-2 text-[11.5px] text-ink-subtle tabular">{readableSize(file.size)}</span>
              </span>
              <span className="text-[11.5px] text-amber-800">attaches on save</span>
              <Button
                type="button" variant="ghost" size="icon" aria-label={`Remove ${file.name}`}
                onClick={() => onPendingChange?.((pending ?? []).filter((_, i) => i !== index))}
              >
                <Trash2 className="size-3.5 text-ink-subtle" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Uploads files a form held while its record did not yet exist. */
export async function uploadPendingFiles(entityType: EntityType, entityId: string, files: File[]) {
  const failures: string[] = [];
  for (const file of files) {
    const form = new FormData();
    form.set("entityType", entityType);
    form.set("entityId", entityId);
    form.set("file", file);
    const result = await uploadAttachmentAction(form);
    if (!result.ok) failures.push(`${file.name}: ${result.error}`);
  }
  return failures;
}
