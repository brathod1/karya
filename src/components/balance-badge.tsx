"use client";
import { ArrowUp, Check, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/cn";
import { useConfig } from "./config-provider";

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";

/**
 * The direct upgrade of the spreadsheet's red/green balance cells.
 * Colour is never the only signal — every state carries a label and an icon,
 * and the whole badge is a button that opens "Record payment".
 */
export function BalanceBadge({ status, balanceMinor, onClick, size = "md", className }: {
  status: PaymentStatus; balanceMinor: number;
  onClick?: () => void; size?: "sm" | "md"; className?: string;
}) {
  const { money } = useConfig();

  const config = {
    PAID:     { icon: Check,      tone: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100", label: "Paid",           text: "Paid" },
    PARTIAL:  { icon: CircleDot,  tone: "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100",         label: "Partially paid", text: `${money(Math.max(balanceMinor, 0))} due` },
    UNPAID:   { icon: Circle,     tone: "bg-red-50 text-red-800 ring-red-200 hover:bg-red-100",                 label: "Unpaid",         text: `${money(Math.max(balanceMinor, 0))} due` },
    OVERPAID: { icon: ArrowUp,    tone: "bg-blue-50 text-blue-800 ring-blue-200 hover:bg-blue-100",             label: "Overpaid",       text: `${money(Math.abs(balanceMinor))} over` },
  }[status];

  const Icon = config.icon;
  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      {...(onClick
        ? {
            type: "button" as const,
            onClick: (event: React.MouseEvent) => { event.stopPropagation(); onClick(); },
          }
        : {})}
      title={onClick ? "Record a payment" : config.label}
      aria-label={`${config.label}. ${config.text}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-medium tabular transition-colors",
        size === "sm" ? "px-2 py-0.5 text-[12px]" : "px-2.5 py-1 text-[13px]",
        config.tone, onClick && "cursor-pointer", className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      <span>{config.text}</span>
    </Tag>
  );
}

export function paymentStatusLabel(status: PaymentStatus) {
  return { PAID: "Paid", PARTIAL: "Partially paid", UNPAID: "Unpaid", OVERPAID: "Overpaid" }[status];
}
