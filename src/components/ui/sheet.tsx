"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function Sheet({ open, onClose, title, description, children, footer, width = "md" }: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children: React.ReactNode; footer?: React.ReactNode; width?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-stone-900/25 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={cn(
          "animate-sheet absolute bg-white shadow-2xl flex flex-col",
          "inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl",
          "sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:rounded-none sm:rounded-l-2xl",
          width === "sm" && "sm:w-[400px]", width === "md" && "sm:w-[520px]", width === "lg" && "sm:w-[720px]",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="text-[12.5px] text-ink-subtle mt-0.5">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 py-3 flex justify-end gap-2 bg-stone-50/60">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", danger, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/25" onClick={onClose} />
      <div className="animate-in relative w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
