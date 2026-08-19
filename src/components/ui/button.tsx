"use client";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover shadow-sm",
  secondary: "bg-white text-ink ring-1 ring-line-strong hover:bg-stone-50",
  ghost: "text-ink-muted hover:bg-stone-100 hover:text-ink",
  subtle: "bg-stone-100 text-ink hover:bg-stone-200",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-9 w-9 justify-center",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center rounded-lg font-medium transition-colors select-none",
        "disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        VARIANTS[variant], SIZES[size], className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

/** Anchor styled as a button — avoids the complexity of a polymorphic `asChild`. */
export function ButtonLink({ className, variant = "primary", size = "md", children, ...props }:
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    <a
      className={cn(
        "inline-flex items-center rounded-lg font-medium transition-colors select-none whitespace-nowrap",
        VARIANTS[variant], SIZES[size], className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
