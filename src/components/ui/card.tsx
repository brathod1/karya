import { cn } from "@/lib/cn";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl bg-white ring-1 ring-line shadow-[0_1px_2px_rgb(0_0_0/0.04)]", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink truncate">{title}</h2>
        {description ? <p className="text-[12.5px] text-ink-subtle mt-0.5">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-line", className)} />;
}
