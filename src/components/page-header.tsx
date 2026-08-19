import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions, className }: {
  title: string; description?: string; actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3 px-4 sm:px-6 pt-6 pb-4", className)}>
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight truncate">{title}</h1>
        {description ? <p className="mt-1 text-[13.5px] text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-4 sm:px-6 pb-10", className)}>{children}</div>;
}
