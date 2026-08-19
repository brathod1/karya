/**
 * HTTP header helpers. Pure, so they can be tested without booting the server.
 */

/**
 * Builds a `Content-Disposition` value that survives non-Latin-1 filenames.
 *
 * HTTP header values are Latin-1. A filename like "ऑर्डर-bill.pdf" — entirely
 * ordinary for this application's users — throws when placed in a header
 * directly, so the UTF-8 form goes in RFC 5987 `filename*` with an ASCII
 * fallback beside it for older clients.
 */
export function contentDisposition(fileName: string, disposition: "inline" | "attachment" = "inline"): string {
  // A name made entirely of non-ASCII characters collapses to underscores;
  // fall back to something meaningful rather than shipping "___".
  const flattened = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\\r\n]/g, "_").trim();
  const ascii = /^[_\s]*$/.test(flattened) ? "file" : flattened;
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
