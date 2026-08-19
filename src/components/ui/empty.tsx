import { cn } from "@/lib/cn";

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string; description?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6 py-14", className)}>
      {Icon ? (
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-stone-100">
          <Icon className="size-6 text-ink-subtle" />
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-5 flex-1", c === 0 && "max-w-[90px]")} />
          ))}
        </div>
      ))}
    </div>
  );
}
