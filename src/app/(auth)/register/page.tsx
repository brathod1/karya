import Link from "next/link";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-ink-muted">You&apos;ll set up your business in the next step.</p>
      <div className="mt-7"><RegisterForm /></div>
      <p className="mt-6 text-[13px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
