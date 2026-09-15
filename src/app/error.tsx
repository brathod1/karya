"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // An error boundary swallows the error, so the browser's global handlers
    // never see it. Report it explicitly; a no-op when Sentry isn't configured.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
    }
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          Nothing was saved. Try again, and if it keeps happening the message below will help track it down.
        </p>
        <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 font-mono text-[12px] text-ink-muted">{error.message}</p>
        <button onClick={reset} className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white">
          Try again
        </button>
      </div>
    </div>
  );
}
