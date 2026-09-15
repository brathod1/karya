/**
 * Browser-side error reporting.
 *
 * The SDK is loaded only when a DSN was configured at build time, so phones
 * don't download it for nothing. NEXT_PUBLIC_ variables are inlined into the
 * bundle by Next — which is also why this can't go through server/env.ts.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
  });
}
