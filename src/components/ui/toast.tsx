"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
type Ctx = { push: (message: string, tone?: Toast["tone"]) => void };

const ToastContext = createContext<Ctx>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    setItems((prev) => [...prev, { id: Date.now() + Math.random(), message, tone }]);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed z-[60] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {items.map((t) => <ToastItem key={t.id} toast={t} onDone={() => setItems((p) => p.filter((x) => x.id !== t.id))} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, toast.tone === "error" ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [onDone, toast.tone]);

  const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? AlertCircle : Info;
  return (
    <div className={cn(
      "animate-in pointer-events-auto flex items-start gap-2.5 rounded-lg px-3.5 py-3 shadow-lg ring-1 text-sm max-w-sm bg-white",
      toast.tone === "success" && "ring-emerald-200",
      toast.tone === "error" && "ring-red-200",
      toast.tone === "info" && "ring-stone-200",
    )}>
      <Icon className={cn("size-4 mt-0.5 shrink-0",
        toast.tone === "success" && "text-emerald-600",
        toast.tone === "error" && "text-red-600",
        toast.tone === "info" && "text-stone-500")} />
      <span className="flex-1 text-ink">{toast.message}</span>
      <button onClick={onDone} aria-label="Dismiss" className="text-ink-subtle hover:text-ink"><X className="size-3.5" /></button>
    </div>
  );
}
