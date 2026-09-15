/**
 * Liveness for an external uptime monitor.
 *
 * Deliberately does not touch the database. A check every few minutes would
 * keep Neon's compute awake around the clock, which costs money and hides the
 * free tier's idle suspend. This answers "is the app deployed and serving";
 * database failures surface as errors in Sentry instead.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
