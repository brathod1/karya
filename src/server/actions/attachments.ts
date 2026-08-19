"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { attachments, customers, events, expenses, orders, products } from "@/server/db/schema";
import { requireOrgContext } from "@/server/context";
import { logAudit } from "@/server/domain/audit";
import { storage, storeUpload } from "@/server/storage";
import { can, type Capability } from "@/lib/permissions";
import { fail } from "./result";

const entitySchema = z.enum(["ORDER", "ORDER_ITEM", "CUSTOMER", "PRODUCT", "EXPENSE", "EVENT"]);
type EntityType = z.infer<typeof entitySchema>;

/** Attaching a file needs the same permission as editing the thing it hangs off. */
const CAPABILITY: Record<EntityType, Capability> = {
  ORDER: "order:update",
  ORDER_ITEM: "order:update",
  CUSTOMER: "customer:manage",
  PRODUCT: "product:manage",
  EXPENSE: "expense:manage",
  EVENT: "event:manage",
};

export type AttachmentView = {
  id: string; fileName: string; mimeType: string; sizeBytes: number;
  url: string; isImage: boolean; createdAt: string;
};

export async function listAttachmentsAction(entityType: string, entityId: string) {
  try {
    const ctx = await requireOrgContext();
    const parsed = entitySchema.parse(entityType);
    const rows = await db.select().from(attachments)
      .where(and(
        eq(attachments.orgId, ctx.org.id),
        eq(attachments.entityType, parsed),
        eq(attachments.entityId, entityId),
      ))
      .orderBy(asc(attachments.createdAt));

    return {
      ok: true as const,
      data: rows.map<AttachmentView>((r) => ({
        id: r.id, fileName: r.fileName, mimeType: r.mimeType, sizeBytes: r.sizeBytes,
        url: `/api/attachments/${r.id}`, isImage: r.mimeType.startsWith("image/"),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (error) { return fail(error); }
}

/**
 * A UUID from a browser proves nothing about ownership. Reads are org-scoped so
 * nothing can leak, but without this an attachment could be hung off an id
 * belonging to another workspace.
 */
async function assertEntityInOrg(orgId: string, entityType: EntityType, entityId: string) {
  const table = {
    ORDER: orders, ORDER_ITEM: orders, CUSTOMER: customers,
    PRODUCT: products, EXPENSE: expenses, EVENT: events,
  }[entityType];

  const [row] = await db.select({ id: table.id }).from(table)
    .where(and(eq(table.orgId, orgId), eq(table.id, entityId))).limit(1);
  if (!row) {
    const err = new Error("That record no longer exists.") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
}

export async function uploadAttachmentAction(formData: FormData) {
  try {
    const ctx = await requireOrgContext();
    const entityType = entitySchema.parse(formData.get("entityType"));
    const entityId = z.string().uuid().parse(formData.get("entityId"));

    if (!can(ctx.role, CAPABILITY[entityType])) {
      return { ok: false as const, error: `Your role (${ctx.role}) cannot attach files here.` };
    }
    await assertEntityInOrg(ctx.org.id, entityType, entityId);

    const file = formData.get("file") as File | null;
    if (!file) return { ok: false as const, error: "Choose a file." };

    const data = Buffer.from(await file.arrayBuffer());
    const stored = await storeUpload(ctx.org.id, entityType, entityId, {
      name: file.name, type: file.type, data,
    });
    // storeUpload verifies the bytes really are what the browser claimed.

    const [row] = await db.insert(attachments).values({
      orgId: ctx.org.id, entityType, entityId,
      fileName: file.name, mimeType: file.type,
      sizeBytes: stored.sizeBytes, storageKey: stored.storageKey,
      uploadedByUserId: ctx.actor.userId,
    }).returning();

    await logAudit(db, {
      orgId: ctx.org.id, actor: ctx.actor, action: "attachment.create",
      entityType: "Attachment", entityId: row.id,
      after: { fileName: row.fileName, sizeBytes: row.sizeBytes, on: `${entityType}:${entityId}` },
    });

    revalidatePath("/expenses"); revalidatePath("/products"); revalidatePath("/orders");
    return {
      ok: true as const,
      data: {
        id: row.id, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes,
        url: `/api/attachments/${row.id}`, isImage: row.mimeType.startsWith("image/"),
        createdAt: row.createdAt.toISOString(),
      } satisfies AttachmentView,
    };
  } catch (error) { return fail(error); }
}

export async function deleteAttachmentAction(id: string) {
  try {
    const ctx = await requireOrgContext();
    const [row] = await db.select().from(attachments)
      .where(and(eq(attachments.orgId, ctx.org.id), eq(attachments.id, id))).limit(1);
    if (!row) return { ok: false as const, error: "That file no longer exists." };

    if (!can(ctx.role, CAPABILITY[row.entityType])) {
      return { ok: false as const, error: `Your role (${ctx.role}) cannot remove this file.` };
    }

    await db.delete(attachments).where(and(eq(attachments.orgId, ctx.org.id), eq(attachments.id, id)));
    await storage().remove(row.storageKey);
    await logAudit(db, {
      orgId: ctx.org.id, actor: ctx.actor, action: "attachment.delete",
      entityType: "Attachment", entityId: id, before: { fileName: row.fileName },
    });

    revalidatePath("/expenses"); revalidatePath("/products"); revalidatePath("/orders");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}
