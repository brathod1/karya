/**
 * `sslmode=require` is what hosted Postgres providers hand you, and `pg` today
 * treats it as `verify-full` — full certificate verification. It warns on every
 * boot that a future major version will downgrade that to libpq semantics,
 * which verify nothing.
 *
 * Saying `verify-full` explicitly keeps exactly the behaviour we already have,
 * silences the warning, and means a future `pg` upgrade cannot quietly weaken
 * the connection. Anything the caller states deliberately is left alone.
 *
 * Kept free of imports so it can be tested without a database or environment.
 */
export function normaliseConnectionString(url: string): string {
  if (!/sslmode=/.test(url)) return url;
  if (/uselibpqcompat=true/.test(url)) return url;
  return url.replace(/sslmode=(require|prefer|verify-ca)\b/, "sslmode=verify-full");
}
