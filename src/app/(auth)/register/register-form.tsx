"use client";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { registerAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null as { ok: boolean; error?: string } | null);

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && state.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
          <AlertCircle className="size-4 mt-px shrink-0" />{state.error}
        </p>
      ) : null}

      <Field label="Your name"><Input name="name" required placeholder="Riya" autoComplete="name" /></Field>
      <Field label="Email"><Input name="email" type="email" required placeholder="you@example.com" autoComplete="email" /></Field>
      <Field label="Password" help="At least 8 characters."><Input name="password" type="password" required autoComplete="new-password" /></Field>
      <Button type="submit" className="w-full" loading={pending} size="lg">Create account</Button>
    </form>
  );
}
