"use client";
import { cloneElement, forwardRef, isValidElement, useId } from "react";
import { cn } from "@/lib/cn";

const baseControl =
  "w-full rounded-lg bg-white text-sm text-ink ring-1 ring-line-strong " +
  "placeholder:text-ink-subtle transition focus:ring-2 focus:ring-brand focus:outline-none " +
  "disabled:bg-stone-50 disabled:text-ink-subtle";

export function Label({ children, htmlFor, required, className }: {
  children: React.ReactNode; htmlFor?: string; required?: boolean; className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-[13px] font-medium text-ink-muted mb-1.5", className)}>
      {children}
      {required ? <span className="text-red-600 ml-0.5" aria-hidden>*</span> : null}
    </label>
  );
}

export function Field({ label, required, error, help, children, className }: {
  label?: string; required?: boolean; error?: string | null; help?: string;
  children: React.ReactNode; className?: string;
}) {
  const id = useId();
  const described = error ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className={cn("min-w-0", className)}>
      {label ? <Label htmlFor={id} required={required}>{label}</Label> : null}
      <div aria-describedby={described}>{withId(id, children)}</div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] text-red-600 flex items-center gap-1">{error}</p>
      ) : help ? (
        <p id={`${id}-help`} className="mt-1.5 text-[12px] text-ink-subtle">{help}</p>
      ) : null}
    </div>
  );
}

/** Passes the generated id down to a single child control so labels stay linked. */
function withId(id: string, children: React.ReactNode): React.ReactNode {
  if (isValidElement<{ id?: string }>(children) && !children.props.id) {
    return cloneElement(children, { id });
  }
  return children;
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return <input ref={ref} className={cn(baseControl, "h-10 px-3", invalid && "ring-red-500", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(baseControl, "px-3 py-2 resize-y", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(baseControl, "h-10 px-2.5 pr-8 appearance-none bg-no-repeat", className)}
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2357534E' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundPosition: "right 8px center",
        }}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-brand" : "bg-stone-300",
      )}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}
