import Link from "next/link";
import { registrationOpen } from "@/server/env";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  const open = registrationOpen();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        {open
          ? "You'll set up your business in the next step."
          : "Sign-up is by invitation for now. Use the email address you were invited with."}
      </p>
      <div className="mt-7"><RegisterForm /></div>
      <p className="mt-6 text-[13px] text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
