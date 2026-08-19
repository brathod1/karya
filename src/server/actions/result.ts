export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Next implements `redirect()` and `notFound()` by throwing a tagged error.
 * Those must travel up to the framework, never be reported to the user as a
 * failed action — otherwise an expired session shows a toast reading
 * "NEXT_REDIRECT" instead of navigating to the sign-in page.
 */
function isFrameworkSignal(error: unknown): boolean {
  return typeof (error as { digest?: unknown })?.digest === "string";
}

export function fail(error: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (isFrameworkSignal(error)) throw error;

  if (error instanceof Error) {
    const withFields = error as Error & { fieldErrors?: Record<string, string> };
    return { ok: false, error: error.message, fieldErrors: withFields.fieldErrors };
  }
  return { ok: false, error: "Something went wrong. Please try again." };
}

export function ok<T>(data: T) {
  return { ok: true as const, data };
}
