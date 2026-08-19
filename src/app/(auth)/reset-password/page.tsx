import Link from "next/link";
import { checkResetToken } from "@/server/domain/passwordReset";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const check = await checkResetToken(token ?? "");

  if (!check.valid) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Link no longer works</h1>
        <p className="mt-2 text-sm text-ink-muted">{check.reason}</p>
        <p className="mt-6 text-[13px] text-ink-muted">
          Ask whoever runs your workspace for a fresh link, then{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">sign in</Link>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        For <span className="font-medium text-ink">{check.email}</span>. This will sign you out everywhere else.
      </p>
      <div className="mt-7"><ResetForm token={token ?? ""} /></div>
    </div>
  );
}
