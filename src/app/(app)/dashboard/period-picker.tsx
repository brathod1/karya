"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

const PERIODS = [
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "quarter", label: "3 months" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

export function PeriodPicker({ current }: { current: string }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-stone-100 p-1">
      {PERIODS.map((period) => {
        const active = period.value === current;
        return (
          <button
            key={period.value}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              if (period.value === "month") next.delete("range");
              else next.set("range", period.value);
              router.push(`/dashboard${next.size ? `?${next}` : ""}`);
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors",
              active ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink",
            )}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}
