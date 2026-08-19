"use client";
import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { statusColorClasses } from "@/lib/colors";

export type StatusOption = { id: string; label: string; color: string; isCompleted: boolean; isActive: boolean };

export function StatusChip({ status, className }: { status: { label: string; color: string } | null; className?: string }) {
  if (!status) return <span className="text-ink-subtle">—</span>;
  const c = statusColorClasses(status.color);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium ring-1 ring-inset", c.chip, className)}>
      <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden />
      {status.label}
    </span>
  );
}

/** Inline status switcher used in tables and on the order page. */
export function StatusPicker({ current, options, onChange, disabled }: {
  current: StatusOption | null; options: StatusOption[];
  onChange: (statusId: string) => Promise<void> | void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const c = statusColorClasses(current?.color ?? "neutral");

  if (disabled) return <StatusChip status={current} />;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium ring-1 ring-inset transition",
          c.chip, pending && "opacity-60",
        )}
      >
        <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden />
        {current?.label ?? "Set status"}
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <ul role="listbox" className="absolute z-40 mt-1 min-w-[180px] rounded-lg bg-white p-1 shadow-lg ring-1 ring-line animate-in">
            {options.filter((o) => o.isActive || o.id === current?.id).map((option) => {
              const oc = statusColorClasses(option.color);
              return (
                <li key={option.id}>
                  <button
                    type="button" role="option" aria-selected={option.id === current?.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      startTransition(async () => { await onChange(option.id); });
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-stone-100",
                      option.id === current?.id && "bg-stone-50 font-medium",
                    )}
                  >
                    <span className={cn("size-2 rounded-full", oc.dot)} aria-hidden />
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
