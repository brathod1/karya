import { cn } from "@/lib/cn";

export function ProgressBar({ value, className, tone = "brand", label }: {
  value: number; className?: string; tone?: "brand" | "emerald" | "amber"; label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const bg = { brand: "bg-brand", emerald: "bg-emerald-500", amber: "bg-amber-500" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-stone-200", className)}
      role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 96, stroke = 9, caption, sub }: {
  value: number; size?: number; stroke?: number; caption?: string; sub?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${pct}% complete`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E7E5E4" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={pct >= 100 ? "#059669" : "#0F766E"} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 500ms ease-out" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-[19px] font-semibold tabular leading-none">{pct}%</div>
        {caption ? <div className="mt-0.5 text-[11px] text-ink-subtle tabular">{caption}</div> : null}
        {sub ? <div className="text-[10.5px] text-ink-subtle">{sub}</div> : null}
      </div>
    </div>
  );
}
