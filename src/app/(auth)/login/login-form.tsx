"use client";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null as { ok: boolean; error?: string } | null);

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && state.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
          <AlertCircle className="size-4 mt-px shrink-0" />{state.error}
        </p>
      ) : null}

      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
      </Field>
      <Button type="submit" className="w-full" loading={pending} size="lg">Sign in</Button>

      <p className="rounded-lg bg-stone-100 px-3 py-2.5 text-[12.5px] text-ink-muted">
        Demo workspace: <span className="font-medium text-ink">demo@karya.app</span> / <span className="font-medium text-ink">demo1234</span>
      </p>
    </form>
  );
}
