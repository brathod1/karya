"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { toMajor, toMinor } from "@/lib/money";
import { useConfig } from "./config-provider";

/**
 * Accepts "1,250", "1250", "1250.50". Emits integer minor units.
 * The currency symbol is an affix from configuration, never baked into the value.
 */
export function MoneyInput({ valueMinor, onChange, id, name, placeholder = "0", disabled, className, autoFocus }: {
  valueMinor: number | null; onChange: (minor: number) => void;
  id?: string; name?: string; placeholder?: string; disabled?: boolean; className?: string; autoFocus?: boolean;
}) {
  const { currencySymbol } = useConfig();
  const [text, setText] = useState(() => (valueMinor ? String(toMajor(valueMinor)) : ""));

  useEffect(() => {
    const current = toMinor(text);
    if (valueMinor !== null && current !== valueMinor) setText(valueMinor ? String(toMajor(valueMinor)) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMinor]);

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-subtle">{currencySymbol}</span>
      <input
        id={id} name={name} inputMode="decimal" autoFocus={autoFocus} disabled={disabled}
        value={text} placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.,]/g, "");
          setText(next);
          onChange(toMinor(next));
        }}
        onBlur={() => { const m = toMinor(text); setText(m ? String(toMajor(m)) : ""); }}
        className={cn(
          "h-10 w-full rounded-lg bg-white pl-7 pr-3 text-sm tabular ring-1 ring-line-strong",
          "focus:ring-2 focus:ring-brand focus:outline-none disabled:bg-stone-50",
        )}
      />
    </div>
  );
}
