import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function MetricCard({ label, value, sub, delta, tone = "default", icon: Icon, className }: {
  label: string; value: string; sub?: string;
  delta?: { pct: number; label?: string } | null;
  tone?: "default" | "positive" | "warning" | "danger";
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const toneClass = {
    default: "text-ink",
    positive: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
  }[tone];

  return (
    <div className={cn("rounded-xl bg-white ring-1 ring-line px-4 py-3.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-ink-muted uppercase tracking-wide">{label}</p>
        {Icon ? <Icon className="size-4 text-ink-subtle" /> : null}
      </div>
      <p className={cn("mt-1.5 text-[26px] font-semibold tabular leading-tight", toneClass)}>{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {sub ? <span className="text-[12px] text-ink-subtle">{sub}</span> : null}
        {delta ? (
          <span className={cn("inline-flex items-center gap-0.5 text-[12px] font-medium", delta.pct >= 0 ? "text-emerald-700" : "text-red-700")}>
            {delta.pct >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta.pct)}%{delta.label ? <span className="text-ink-subtle font-normal ml-1">{delta.label}</span> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
