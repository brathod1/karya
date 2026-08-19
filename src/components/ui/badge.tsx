import { cn } from "@/lib/cn";
import { statusColorClasses } from "@/lib/colors";

export function Badge({ color = "neutral", children, className, dot }: {
  color?: string; children: React.ReactNode; className?: string; dot?: boolean;
}) {
  const c = statusColorClasses(color);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset", c.chip, className)}>
      {dot ? <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden /> : null}
      {children}
    </span>
  );
}
