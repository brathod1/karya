"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export type ComboOption = { value: string; label: string; hint?: string };

/**
 * Type-ahead picker with create-on-the-fly. Used for customers and products so
 * that adding a missing record never forces the user to abandon the form.
 */
export function Combobox({
  value, onChange, options, placeholder = "Search…", onCreate, createLabel = "Create",
  disabled, id, emptyText = "No matches",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboOption[];
  placeholder?: string;
  onCreate?: (label: string) => Promise<string | null> | string | null;
  createLabel?: string;
  disabled?: boolean;
  id?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)).slice(0, 50);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const exactExists = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="relative" ref={rootRef}>
      <button
        id={id} type="button" disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox" aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg bg-white px-3 text-left text-sm",
          "ring-1 ring-line-strong focus:ring-2 focus:ring-brand focus:outline-none",
          "disabled:bg-stone-50 disabled:text-ink-subtle",
        )}
      >
        <span className={cn("truncate", !selected && "text-ink-subtle")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-subtle" aria-hidden />
      </button>

      {open ? (
        <div className="absolute z-40 mt-1 w-full rounded-lg bg-white shadow-lg ring-1 ring-line animate-in">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-3.5 text-ink-subtle" aria-hidden />
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle"
            />
          </div>

          <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
            {value ? (
              <li>
                <button type="button" onClick={() => { onChange(null); setOpen(false); }}
                  className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-subtle hover:bg-stone-100">
                  Clear selection
                </button>
              </li>
            ) : null}

            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button" role="option" aria-selected={o.value === value}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-stone-100",
                    o.value === value && "bg-stone-50")}
                >
                  <Check className={cn("size-3.5 shrink-0", o.value === value ? "opacity-100 text-brand" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint ? <span className="ml-auto shrink-0 text-[11.5px] text-ink-subtle tabular">{o.hint}</span> : null}
                </button>
              </li>
            ))}

            {filtered.length === 0 && !onCreate ? (
              <li className="px-2.5 py-3 text-[13px] text-ink-subtle">{emptyText}</li>
            ) : null}

            {onCreate && query.trim() && !exactExists ? (
              <li>
                <button
                  type="button" disabled={creating}
                  onClick={async () => {
                    setCreating(true);
                    try {
                      const created = await onCreate(query.trim());
                      if (created) { onChange(created); setOpen(false); setQuery(""); }
                    } finally { setCreating(false); }
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium text-brand hover:bg-teal-50 disabled:opacity-60"
                >
                  <Plus className="size-3.5" />
                  {createLabel} “{query.trim()}”
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
