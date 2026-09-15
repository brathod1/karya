import Link from "next/link";
import { registrationOpen } from "@/server/env";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-ink-muted">Sign in to your workspace.</p>
      {reset ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-900 ring-1 ring-emerald-200">
          Password changed. Sign in with your new one.
        </p>
      ) : null}
      <div className="mt-7"><LoginForm /></div>
      <p className="mt-5 text-[12.5px] text-ink-subtle">
        Forgotten your password? Ask whoever runs your workspace to send you a reset link
        from Settings → Users.
      </p>
      <p className="mt-4 text-[13px] text-ink-muted">
        {registrationOpen() ? "New here?" : "Been invited?"}{" "}
        <Link href="/register" className="font-medium text-brand hover:underline">Create your account</Link>
      </p>
    </div>
  );
}
