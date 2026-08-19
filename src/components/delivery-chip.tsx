"use client";
import { AlertTriangle, CalendarClock, Check, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { deliveryState, relativeDeliveryLabel } from "@/lib/format";
import { useConfig } from "./config-provider";

export function DeliveryChip({ deliveryBy, isCompleted, className, showDate = true }: {
  deliveryBy: string | Date | null | undefined; isCompleted: boolean; className?: string; showDate?: boolean;
}) {
  const { date, orders } = useConfig();
  const { state, days } = deliveryState(deliveryBy, isCompleted, orders.dueSoonDays);
  const dateLabel = date(deliveryBy ?? null);

  if (state === "none") return <span className="text-ink-subtle">—</span>;

  const map = {
    done:     { tone: "bg-emerald-50 text-emerald-800 ring-emerald-200", Icon: Check },
    overdue:  { tone: "bg-red-50 text-red-800 ring-red-200",             Icon: AlertTriangle },
    today:    { tone: "bg-red-50 text-red-800 ring-red-200",             Icon: Clock },
    soon:     { tone: "bg-amber-50 text-amber-900 ring-amber-200",       Icon: Clock },
    upcoming: { tone: "bg-stone-50 text-stone-700 ring-stone-200",       Icon: CalendarClock },
    none:     { tone: "", Icon: CalendarClock },
  }[state];

  const label = relativeDeliveryLabel(state, days, dateLabel);

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap", map.tone, className)}>
      <map.Icon className="size-3" aria-hidden />
      {label}
      {showDate && state !== "upcoming" && state !== "done" ? <span className="opacity-70">· {dateLabel}</span> : null}
    </span>
  );
}
