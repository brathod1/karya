import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { env } from "./env";
import { attachmentBlobs } from "./db/schema";

/**
 * File storage behind a driver interface.
 *
 * Two drivers, chosen with STORAGE_DRIVER:
 *
 *   local     — writes to disk. Right for a small server or a VPS with a volume.
 *   database  — stores the bytes in Postgres. Right for serverless hosts, whose
 *               filesystem is wiped between requests, and it means attachments
 *               are covered by whatever backs up the database.
 *
 * The database driver is deliberate rather than a compromise at this scale: a
 * few thousand phone photos of receipts is well within what Postgres handles
 * comfortably, and it removes a whole external service from the deployment.
 * Watch your database size; move to object storage when attachments outgrow it.
 * Adding that driver means implementing three methods below and nothing else.
 */

export type StoredFile = { storageKey: string; sizeBytes: number; checksum: string };

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

function localRoot() {
  return path.resolve(process.cwd(), env().STORAGE_LOCAL_DIR);
}

/** Resolves a key inside the storage root, refusing anything that escapes it. */
function resolveKey(key: string): string {
  const root = localRoot();
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key.");
  }
  return target;
}

const localDriver: StorageDriver = {
  async put(key, data) {
    const target = resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  },
  async get(key) {
    return readFile(resolveKey(key));
  },
  async remove(key) {
    const target = resolveKey(key); // throws on an invalid key rather than silently succeeding
    await unlink(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },
};

/**
 * Keys carry the organisation as their first segment, which is what lets the
 * database driver scope every row without a second lookup.
 */
function orgIdFromKey(key: string): string {
  const [orgId] = key.split("/");
  if (!orgId) throw new Error("Invalid storage key.");
  return orgId;
}

/**
 * Imported on demand rather than at module load: the connection pool reads the
 * environment as it is created, and the pure helpers in this file (key building,
 * filename safety, content sniffing) must stay importable without a database.
 */
async function blobDb() {
  return (await import("./db")).db;
}

const databaseDriver: StorageDriver = {
  async put(key, data) {
    const db = await blobDb();
    await db.insert(attachmentBlobs)
      .values({ storageKey: key, orgId: orgIdFromKey(key), data })
      .onConflictDoUpdate({ target: attachmentBlobs.storageKey, set: { data } });
  },
  async get(key) {
    const db = await blobDb();
    const [row] = await db.select({ data: attachmentBlobs.data }).from(attachmentBlobs)
      .where(and(eq(attachmentBlobs.storageKey, key), eq(attachmentBlobs.orgId, orgIdFromKey(key))))
      .limit(1);
    if (!row) throw new Error("File not found in storage.");
    return row.data;
  },
  async remove(key) {
    const db = await blobDb();
    await db.delete(attachmentBlobs)
      .where(and(eq(attachmentBlobs.storageKey, key), eq(attachmentBlobs.orgId, orgIdFromKey(key))));
  },
};

export function storage(): StorageDriver {
  switch (env().STORAGE_DRIVER) {
    case "database":
      return databaseDriver;
    case "local":
    default:
      return localDriver;
  }
}

/**
 * 4 MB, not 10.
 *
 * Serverless platforms cap the request body — Vercel at 4.5 MB — and a file
 * over that limit fails at the platform with an opaque 413 before any of this
 * code runs. Staying under it means the user gets our sentence instead.
 * Photographs are compressed in the browser to a few hundred KB first, so in
 * practice this only affects large PDFs.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/**
 * Strips anything that could confuse a filesystem or a Content-Disposition header.
 *
 * Separators are flattened rather than `basename`-d, so "bill; rm -rf /.pdf"
 * keeps a recognisable name instead of collapsing to ".pdf". Leading dots are
 * removed so an upload can never become a hidden or dot-prefixed file.
 */
export function safeFileName(name: string): string {
  const flattened = String(name ?? "").replace(/[\\/]+/g, "_");
  const cleaned = flattened.replace(/[^\w.\- ]+/g, "_").replace(/^[.\s]+/, "").trim();
  return (cleaned || "file").slice(0, 120);
}

/**
 * Keys are generated server-side and namespaced by organisation, so one tenant's
 * key can never address another tenant's object even if it leaks.
 */
export function buildStorageKey(orgId: string, entityType: string, entityId: string, fileName: string): string {
  return path.posix.join(orgId, entityType.toLowerCase(), entityId, `${randomUUID()}-${safeFileName(fileName)}`);
}

/** Leading bytes for the formats we accept. `heic` is a box-typed MP4 variant. */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a",
  "image/webp": (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  "image/heic": (b) => b.subarray(4, 8).toString("ascii") === "ftyp",
  "application/pdf": (b) => b.subarray(0, 5).toString("ascii") === "%PDF-",
};

/** True when the bytes match the declared type. */
export function contentMatchesType(mimeType: string, data: Buffer): boolean {
  const check = MAGIC[mimeType];
  return check ? data.byteLength >= 12 && check(data) : false;
}

export async function storeUpload(
  orgId: string, entityType: string, entityId: string, file: { name: string; type: string; data: Buffer },
): Promise<StoredFile> {
  if (file.data.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`That file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
  }
  if (!ALLOWED_UPLOAD_TYPES[file.type]) {
    throw new Error("Only images and PDFs can be attached.");
  }
  if (!contentMatchesType(file.type, file.data)) {
    throw new Error("That file does not look like the type it claims to be.");
  }

  const storageKey = buildStorageKey(orgId, entityType, entityId, file.name);
  await storage().put(storageKey, file.data);

  return {
    storageKey,
    sizeBytes: file.data.byteLength,
    checksum: createHash("sha256").update(file.data).digest("hex").slice(0, 16),
  };
}
