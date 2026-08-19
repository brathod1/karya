"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./ui/button";
import { Input } from "./ui/field";
import {
  MONTH_SHORT, PRESETS, PRESET_LABELS, financialYearLabel, monthKeyOf, type PeriodParams,
} from "@/lib/period";

type Tab = "quick" | "months" | "years" | "custom";

/**
 * Choosing a stretch of time.
 *
 * Four ways in, because people think about time in different units: a quick
 * preset, a run of months, a year (calendar or financial), or exact dates.
 * Tapping two months selects the run between them, which is how a range gets
 * picked in two taps rather than through two dropdowns.
 */
export function PeriodPicker({ label, selected, years, financialYears }: {
  label: string;
  selected: PeriodParams;
  years: number[];
  financialYears: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("quick");
  const rootRef = useRef<HTMLDivElement>(null);

  const [monthYear, setMonthYear] = useState(years[0] ?? new Date().getFullYear());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState(selected.from ?? "");
  const [customTo, setCustomTo] = useState(selected.to ?? "");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const apply = (params: PeriodParams) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    router.push(next.size ? `${pathname}?${next}` : pathname);
    setOpen(false);
    setAnchor(null);
  };

  // Two taps define a run: the first sets an anchor, the second closes the span.
  const chooseMonth = (index: number) => {
    const key = monthKeyOf(monthYear, index);
    if (!anchor) { setAnchor(key); return; }
    const [from, to] = anchor <= key ? [anchor, key] : [key, anchor];
    apply({ from, to });
  };

  const selectedKeys = useMemo(() => ({
    range: selected.range, year: selected.year, fy: selected.fy,
  }), [selected]);

  return (
    <div className="relative" ref={rootRef}>
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <CalendarRange className="size-3.5" />
        {label}
        <ChevronDown className="size-3 opacity-60" />
      </Button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-[320px] rounded-xl bg-white p-2 shadow-xl ring-1 ring-line animate-in">
          <div className="mb-2 flex gap-1 rounded-lg bg-stone-100 p-1">
            {([
              ["quick", "Quick"], ["months", "Months"], ["years", "Years"], ["custom", "Exact"],
            ] as [Tab, string][]).map(([value, text]) => (
              <button
                key={value} type="button" onClick={() => setTab(value)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-[12.5px] font-medium transition-colors",
                  tab === value ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                )}
              >
                {text}
              </button>
            ))}
          </div>

          {tab === "quick" ? (
            <ul className="space-y-0.5">
              {PRESETS.map((preset) => (
                <li key={preset}>
                  <button
                    type="button" onClick={() => apply({ range: preset })}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-stone-100"
                  >
                    <Check className={cn("size-3.5", selectedKeys.range === preset ? "text-brand" : "opacity-0")} />
                    {PRESET_LABELS[preset]}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {tab === "months" ? (
            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <button type="button" onClick={() => setMonthYear((y) => y - 1)}
                  className="rounded px-2 py-1 text-[13px] text-ink-muted hover:bg-stone-100">‹</button>
                <span className="text-[13px] font-medium tabular">{monthYear}</span>
                <button type="button" onClick={() => setMonthYear((y) => y + 1)}
                  className="rounded px-2 py-1 text-[13px] text-ink-muted hover:bg-stone-100">›</button>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {MONTH_SHORT.map((month, index) => {
                  const key = monthKeyOf(monthYear, index);
                  const isAnchor = anchor === key;
                  const inSelection = selected.from && selected.to
                    ? key >= selected.from && key <= selected.to
                    : selected.from === key;
                  return (
                    <button
                      key={month} type="button" onClick={() => chooseMonth(index)}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors",
                        isAnchor ? "bg-brand text-white"
                          : inSelection ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200"
                          : "hover:bg-stone-100",
                      )}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 px-1 text-[11.5px] text-ink-subtle">
                {anchor
                  ? "Now pick the last month of the range — or the same one again for a single month."
                  : "Tap one month, then another, to cover everything between them."}
              </p>
            </div>
          ) : null}

          {tab === "years" ? (
            <div className="space-y-2">
              <div>
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">Calendar year</p>
                <div className="flex flex-wrap gap-1">
                  {years.map((year) => (
                    <button
                      key={year} type="button" onClick={() => apply({ year: String(year) })}
                      className={cn("rounded-md px-2.5 py-1.5 text-[12.5px] font-medium tabular transition-colors",
                        selectedKeys.year === String(year) ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200" : "hover:bg-stone-100")}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                  Financial year · April to March
                </p>
                <div className="flex flex-wrap gap-1">
                  {financialYears.map((year) => (
                    <button
                      key={year} type="button" onClick={() => apply({ fy: String(year) })}
                      className={cn("rounded-md px-2.5 py-1.5 text-[12.5px] font-medium tabular transition-colors",
                        selectedKeys.fy === String(year) ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200" : "hover:bg-stone-100")}
                    >
                      {financialYearLabel(year)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {tab === "custom" ? (
            <div className="space-y-2 px-1">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-medium text-ink-muted">From</span>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11.5px] font-medium text-ink-muted">To</span>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9" />
                </label>
              </div>
              <Button
                size="sm" className="w-full"
                disabled={!customFrom || !customTo || customFrom > customTo}
                onClick={() => apply({ from: customFrom, to: customTo })}
              >
                Apply
              </Button>
              {customFrom && customTo && customFrom > customTo ? (
                <p className="text-[11.5px] text-red-600">The first date needs to come before the second.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
