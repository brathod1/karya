"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Bookmark, Check, ChevronLeft, ChevronRight, Columns3, Download,
  Filter as FilterIcon, Search, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/empty";
import { useToast } from "./ui/toast";
import {
  deleteViewAction, listSavedViewsAction, saveViewAction, type SavedViewSummary,
} from "@/server/actions/views";

/**
 * The table is the product. Everything a spreadsheet user expects — search,
 * filter, sort, choose columns, select rows, act in bulk, export — with none of
 * the things that make a spreadsheet dangerous.
 *
 * Column sets are DATA, not markup, so a business can be given different
 * columns purely through configuration.
 */

export type Column<T> = {
  key: string;
  header: string;
  /** Sort/export value. */
  value?: (row: T) => string | number | null;
  cell?: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  sortable?: boolean;
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Shown in the mobile card as the primary line. */
  mobilePrimary?: boolean;
  mobileHidden?: boolean;
};

export type FilterDef<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

export type BulkAction<T> = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  run: (rows: T[]) => Promise<void> | void;
};

export function DataTable<T extends { id: string }>({
  rows, columns, filters = [], bulkActions = [], searchable, onRowClick, storageKey,
  emptyTitle = "Nothing here yet", emptyDescription, emptyAction, emptyIcon,
  pageSize: initialPageSize = 25, exportName = "export", toolbarExtra,
}: {
  rows: T[];
  columns: Column<T>[];
  filters?: FilterDef<T>[];
  bulkActions?: BulkAction<T>[];
  searchable?: (row: T) => string;
  onRowClick?: (row: T) => void;
  storageKey?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  pageSize?: number;
  exportName?: string;
  toolbarExtra?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [active, setActive] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<string[]>(() => columns.filter((c) => c.defaultHidden).map((c) => c.key));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [showColumns, setShowColumns] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [busy, setBusy] = useState(false);

  // Saved views — a named snapshot of columns, filters, sort and page size.
  const toast = useToast();
  const [views, setViews] = useState<SavedViewSummary[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showViews, setShowViews] = useState(false);
  const [viewName, setViewName] = useState("");
  const [shareView, setShareView] = useState(false);
  const [savingView, setSavingView] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    listSavedViewsAction(storageKey).then((result) => {
      if (!cancelled && result.ok) setViews(result.data);
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  function applyView(view: SavedViewSummary) {
    setHidden(view.config.hidden);
    setActive(view.config.filters);
    setSort(view.config.sort);
    setPageSize(view.config.pageSize);
    setQuery(view.config.query);
    setActiveViewId(view.id);
    setPage(0);
    setShowViews(false);
  }

  async function saveCurrentView() {
    if (!storageKey || !viewName.trim()) return;
    setSavingView(true);
    const result = await saveViewAction({
      entityType: storageKey,
      name: viewName.trim(),
      shared: shareView,
      config: { hidden, filters: active, sort, pageSize, query },
    });
    setSavingView(false);
    if (!result.ok) { toast.push(result.error, "error"); return; }

    const refreshed = await listSavedViewsAction(storageKey);
    if (refreshed.ok) setViews(refreshed.data);
    setActiveViewId(result.data.id);
    setViewName("");
    setShareView(false);
    toast.push("View saved");
  }

  // Column choices persist per user, per table.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(`karya.table.${storageKey}`);
      if (raw) setHidden(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(`karya.table.${storageKey}`, JSON.stringify(hidden)); } catch { /* ignore */ }
  }, [hidden, storageKey]);

  const visible = columns.filter((c) => !hidden.includes(c.key));

  const filtered = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
    if (q && searchable) out = out.filter((r) => searchable(r).toLowerCase().includes(q));
    for (const def of filters) {
      const value = active[def.key];
      if (value) out = out.filter((r) => def.match(r, value));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.value) {
        out = [...out].sort((a, b) => {
          const av = col.value!(a); const bv = col.value!(b);
          if (av === bv) return 0;
          if (av === null || av === undefined) return 1;
          if (bv === null || bv === undefined) return -1;
          const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, query, active, sort, filters, columns, searchable]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const paged = filtered.slice(current * pageSize, current * pageSize + pageSize);
  const activeFilterCount = Object.values(active).filter(Boolean).length;
  const selectedRows = rows.filter((r) => selected.has(r.id));

  function toggleSort(key: string) {
    setSort((prev) => (prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null));
  }

  function exportCsv() {
    const header = visible.map((c) => c.header);
    const lines = filtered.map((row) =>
      visible.map((c) => {
        const v = c.value ? c.value(row) : "";
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }),
    );
    const csv = [header, ...lines].map((r) => r.join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="flex flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line">
        {searchable ? (
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
            <input
              value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              placeholder="Search…"
              className="h-9 w-full rounded-lg bg-white pl-8 pr-8 text-sm ring-1 ring-line-strong focus:ring-2 focus:ring-brand focus:outline-none"
            />
            {query ? (
              <button onClick={() => setQuery("")} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : <div className="flex-1" />}

        {toolbarExtra}

        {filters.length > 0 ? (
          <div className="relative">
            <Button variant={activeFilterCount ? "subtle" : "secondary"} size="sm" onClick={() => setShowFilters((v) => !v)}>
              <FilterIcon className="size-3.5" />
              Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
            {showFilters ? (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} />
                <div className="absolute right-0 z-40 mt-1 w-64 rounded-lg bg-white p-3 shadow-lg ring-1 ring-line animate-in space-y-3">
                  {filters.map((f) => (
                    <div key={f.key}>
                      <label className="block text-[12px] font-medium text-ink-muted mb-1">{f.label}</label>
                      <select
                        value={active[f.key] ?? ""}
                        onChange={(e) => { setActive((p) => ({ ...p, [f.key]: e.target.value })); setPage(0); }}
                        className="h-9 w-full rounded-lg bg-white px-2 text-[13px] ring-1 ring-line-strong focus:ring-2 focus:ring-brand focus:outline-none"
                      >
                        <option value="">All</option>
                        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  ))}
                  {activeFilterCount ? (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => { setActive({}); setPage(0); }}>Clear all</Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {storageKey ? (
          <div className="relative">
            <Button variant={activeViewId ? "subtle" : "secondary"} size="sm" onClick={() => setShowViews((v) => !v)}>
              <Bookmark className="size-3.5" />
              <span className="hidden sm:inline">
                {activeViewId ? views.find((v) => v.id === activeViewId)?.name ?? "Views" : "Views"}
              </span>
            </Button>
            {showViews ? (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowViews(false)} />
                <div className="absolute right-0 z-40 mt-1 w-72 rounded-lg bg-white p-2 shadow-lg ring-1 ring-line animate-in">
                  {views.length > 0 ? (
                    <ul className="mb-2 max-h-56 overflow-y-auto">
                      {views.map((view) => (
                        <li key={view.id} className="flex items-center gap-1">
                          <button
                            type="button" onClick={() => applyView(view)}
                            className={cn("flex flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-stone-100",
                              view.id === activeViewId && "bg-stone-50 font-medium")}
                          >
                            <Check className={cn("size-3.5 shrink-0", view.id === activeViewId ? "text-brand" : "opacity-0")} />
                            <span className="truncate">{view.name}</span>
                            {view.shared ? <span className="ml-auto shrink-0 text-[11px] text-ink-subtle">shared</span> : null}
                          </button>
                          <Button
                            variant="ghost" size="icon" aria-label={`Delete view ${view.name}`}
                            onClick={async () => {
                              const result = await deleteViewAction(view.id);
                              if (!result.ok) { toast.push(result.error, "error"); return; }
                              setViews((prev) => prev.filter((v) => v.id !== view.id));
                              if (activeViewId === view.id) setActiveViewId(null);
                            }}
                          >
                            <Trash2 className="size-3 text-ink-subtle" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-2.5 py-2 text-[12.5px] text-ink-subtle">
                      No saved views yet. Set up the columns and filters you want, then save them here.
                    </p>
                  )}

                  <div className="border-t border-line pt-2">
                    <input
                      value={viewName} onChange={(e) => setViewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveCurrentView(); }}
                      placeholder="Name this view…"
                      className="h-9 w-full rounded-lg bg-white px-2.5 text-[13px] ring-1 ring-line-strong focus:ring-2 focus:ring-brand focus:outline-none"
                    />
                    <label className="mt-2 flex items-center gap-2 px-0.5 text-[12.5px] text-ink-muted">
                      <input type="checkbox" checked={shareView} onChange={(e) => setShareView(e.target.checked)}
                        className="rounded accent-brand" />
                      Share with everyone in the workspace
                    </label>
                    <Button size="sm" className="mt-2 w-full" loading={savingView}
                      disabled={!viewName.trim()} onClick={saveCurrentView}>
                      Save current view
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="relative">
          <Button variant="secondary" size="sm" onClick={() => setShowColumns((v) => !v)}>
            <Columns3 className="size-3.5" />
            <span className="hidden sm:inline">Columns</span>
          </Button>
          {showColumns ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowColumns(false)} />
              <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg bg-white p-2 shadow-lg ring-1 ring-line animate-in max-h-72 overflow-y-auto">
                {columns.filter((c) => c.hideable !== false).map((c) => (
                  <label key={c.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-stone-100 cursor-pointer">
                    <input
                      type="checkbox" checked={!hidden.includes(c.key)}
                      onChange={(e) => setHidden((prev) => (e.target.checked ? prev.filter((k) => k !== c.key) : [...prev, c.key]))}
                      className="rounded accent-brand"
                    />
                    {c.header}
                  </label>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </div>

      {/* bulk bar */}
      {selected.size > 0 && bulkActions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 bg-teal-50 px-3 py-2 border-b border-teal-200 animate-in">
          <span className="text-[13px] font-medium text-teal-900">{selected.size} selected</span>
          <div className="flex-1" />
          {bulkActions.map((action) => (
            <Button
              key={action.label} size="sm" variant={action.danger ? "danger" : "secondary"} loading={busy}
              onClick={async () => {
                setBusy(true);
                try { await action.run(selectedRows); setSelected(new Set()); } finally { setBusy(false); }
              }}
            >
              {action.icon ? <action.icon className="size-3.5" /> : null}
              {action.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}

      {/* desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-stone-50/95 backdrop-blur">
            <tr className="border-b border-line">
              {bulkActions.length > 0 ? (
                <th className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox" aria-label="Select all rows on this page"
                    checked={paged.length > 0 && paged.every((r) => selected.has(r.id))}
                    onChange={(e) => {
                      const next = new Set(selected);
                      paged.forEach((r) => (e.target.checked ? next.add(r.id) : next.delete(r.id)));
                      setSelected(next);
                    }}
                    className="rounded accent-brand"
                  />
                </th>
              ) : null}
              {visible.map((c) => (
                <th key={c.key} style={{ width: c.width }}
                  className={cn("px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-muted whitespace-nowrap",
                    c.align === "right" && "text-right", c.align === "center" && "text-center", c.align !== "right" && c.align !== "center" && "text-left")}>
                  {c.sortable !== false && c.value ? (
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.header}
                      {sort?.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : null}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("border-b border-line last:border-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-stone-50",
                  selected.has(row.id) && "bg-teal-50/50")}
              >
                {bulkActions.length > 0 ? (
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox" aria-label={`Select row ${row.id}`}
                      checked={selected.has(row.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        e.target.checked ? next.add(row.id) : next.delete(row.id);
                        setSelected(next);
                      }}
                      className="rounded accent-brand"
                    />
                  </td>
                ) : null}
                {visible.map((c) => (
                  <td key={c.key}
                    className={cn("px-3 py-2.5 align-middle",
                      c.align === "right" && "text-right tabular", c.align === "center" && "text-center")}>
                    {c.cell ? c.cell(row) : (c.value ? String(c.value(row) ?? "—") : "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="md:hidden divide-y divide-line">
        {paged.map((row) => {
          const primary = visible.find((c) => c.mobilePrimary) ?? visible[0];
          const rest = visible.filter((c) => c.key !== primary.key && !c.mobileHidden).slice(0, 4);
          const primaryContent = primary.cell ? primary.cell(row) : String(primary.value?.(row) ?? "");
          return (
            <li key={row.id}>
              <div
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("px-4 py-3", onRowClick && "active:bg-stone-50")}
              >
                <div className="font-medium">
                  {onRowClick ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRowClick(row); }}
                      className="w-full text-left"
                    >
                      {primaryContent}
                    </button>
                  ) : primaryContent}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted">
                  {rest.map((c) => <span key={c.key}>{c.cell ? c.cell(row) : String(c.value?.(row) ?? "—")}</span>)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search or clear your filters."
          action={<Button variant="secondary" size="sm" onClick={() => { setQuery(""); setActive({}); }}>Clear filters</Button>} />
      ) : null}

      {/* pagination */}
      {filtered.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t border-line text-[13px] text-ink-muted">
          <div className="flex items-center gap-2">
            <span className="tabular">
              {current * pageSize + 1}–{Math.min((current + 1) * pageSize, filtered.length)} of {filtered.length}
            </span>
            <select
              value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              aria-label="Rows per page"
              className="h-7 rounded-md bg-white px-1.5 text-[12.5px] ring-1 ring-line-strong focus:outline-none"
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tabular px-1">{current + 1} / {pageCount}</span>
              <Button variant="ghost" size="icon" aria-label="Next page" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
