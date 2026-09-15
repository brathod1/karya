import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error reporting.
 *
 * Inert until SENTRY_DSN is set, so local development and any deployment
 * without a Sentry project behave exactly as before.
 *
 * Reads process.env directly — the one exception to "only server/env.ts reads
 * the environment": this runs before the application boots, and importing
 * env.ts here would turn a missing app variable into a crash of the reporter
 * that is meant to tell you about it.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // Errors only. Performance tracing is a separate decision, with its own cost.
    tracesSampleRate: 0,
    // No cookies, IP addresses or request bodies: they carry the client's customers' data.
    sendDefaultPii: false,
  });
}

/** Errors thrown while rendering pages, running server actions or route handlers. */
export const onRequestError = Sentry.captureRequestError;
