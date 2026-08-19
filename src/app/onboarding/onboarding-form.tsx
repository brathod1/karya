"use client";
import { useActionState, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { createWorkspaceAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

type Template = {
  key: string; label: string; description: string;
  statuses: string[]; modules: string[]; expenseCategories: string[];
};

export function OnboardingForm({ templates }: { templates: Template[] }) {
  const [state, action, pending] = useActionState(createWorkspaceAction, null as { ok: boolean; error?: string } | null);
  const [template, setTemplate] = useState(templates[0]?.key ?? "generic");
  const selected = templates.find((t) => t.key === template);

  return (
    <form action={action} className="space-y-7">
      {state && !state.ok && state.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
          <AlertCircle className="size-4 mt-px shrink-0" />{state.error}
        </p>
      ) : null}

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-3">Step 1</p>
        <Field label="Business name" required>
          <Input name="name" required placeholder="Threads by Riya" autoFocus />
        </Field>
      </section>

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-3">Step 2</p>
        <Field label="What kind of business is it?" help="Just for your own reference — it doesn't change how the app behaves.">
          <Input name="businessType" placeholder="Crochet / handmade" />
        </Field>
      </section>

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-3">Step 3</p>
        <p className="text-[13px] font-medium text-ink-muted mb-2.5">Choose a starting point</p>
        <input type="hidden" name="template" value={template} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setTemplate(t.key)}
              className={cn(
                "rounded-xl px-4 py-3.5 text-left ring-1 transition",
                template === t.key
                  ? "bg-teal-50 ring-2 ring-brand"
                  : "bg-white ring-line hover:ring-line-strong",
              )}
            >
              <span className="flex items-center gap-1.5 font-medium text-[14px]">
                {t.label}
                {template === t.key ? <Check className="size-3.5 text-brand" /> : null}
              </span>
              <span className="mt-1 block text-[12.5px] text-ink-muted leading-snug">{t.description}</span>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="mt-3 rounded-xl bg-stone-100 px-4 py-3 text-[12.5px] text-ink-muted space-y-1">
            <p><span className="font-medium text-ink">Statuses:</span> {selected.statuses.join(" → ")}</p>
            <p><span className="font-medium text-ink">Modules:</span> {selected.modules.join(", ")}</p>
            <p><span className="font-medium text-ink">Expense categories:</span> {selected.expenseCategories.join(", ") || "none"}</p>
          </div>
        ) : null}
      </section>

      <Button type="submit" size="lg" className="w-full" loading={pending}>Create workspace</Button>
    </form>
  );
}
