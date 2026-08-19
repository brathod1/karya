"use client";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { resetPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null as { ok: boolean; error?: string } | null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state && !state.ok && state.error ? (
        <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-800 ring-1 ring-red-200">
          <AlertCircle className="size-4 mt-px shrink-0" />{state.error}
        </p>
      ) : null}
      <Field label="New password" help="At least 8 characters.">
        <Input name="password" type="password" required autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Type it again">
        <Input name="confirm" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>Set password</Button>
    </form>
  );
}
