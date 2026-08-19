import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { attachments } from "@/server/db/schema";
import { requireOrgContext } from "@/server/context";
import { storage } from "@/server/storage";
import { contentDisposition } from "@/lib/http";

/**
 * Files are never served from a public path. Every request is resolved against
 * the caller's organisation, and a file belonging to another tenant returns 404
 * rather than 403 — the existence of another workspace's data is not disclosed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let orgId: string;
  try {
    orgId = (await requireOrgContext()).org.id;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const [row] = await db.select().from(attachments)
    .where(and(eq(attachments.orgId, orgId), eq(attachments.id, id))).limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await storage().get(row.storageKey);
  } catch {
    return new Response("File missing from storage", { status: 410 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": row.mimeType,
      // measured, not trusted from the row, so the two can never disagree
      "Content-Length": String(data.byteLength),
      "Content-Disposition": contentDisposition(row.fileName),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // a PDF served inline is same-origin; the sandbox keeps it inert
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; object-src 'none'",
    },
  });
}
