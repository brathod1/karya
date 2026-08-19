/**
 * Shrinking photographs before they are uploaded.
 *
 * A receipt photographed on a phone arrives at 2–4 MB and around 4000px wide.
 * Nothing in this application ever displays it larger than a thumbnail or a
 * full-screen preview, so the extra pixels cost storage, upload time on a
 * patchy connection, and bandwidth every time it is viewed — and buy nothing.
 *
 * Re-encoding at 1600px on the long edge keeps a receipt comfortably legible
 * while typically cutting the file by 90–95%.
 *
 * The maths lives here, separate from the browser APIs, so it can be tested.
 */

export const MAX_IMAGE_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

/** Formats that a browser canvas can reliably decode. */
const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Below this, re-encoding tends to cost more than it saves. */
export const COMPRESSION_FLOOR_BYTES = 200 * 1024;

export function shouldCompress(file: { type: string; size: number }): boolean {
  return COMPRESSIBLE.has(file.type) && file.size > COMPRESSION_FLOOR_BYTES;
}

/**
 * Scales dimensions to fit inside a square of `maxEdge`, preserving aspect
 * ratio. Images already small enough are returned untouched — never upscaled.
 */
export function targetDimensions(
  width: number, height: number, maxEdge: number = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human summary of a saving, e.g. "3.1 MB → 184 KB". Null when nothing was gained. */
export function describeSaving(before: number, after: number): string | null {
  if (after >= before) return null;
  return `${formatBytes(before)} → ${formatBytes(after)}`;
}
