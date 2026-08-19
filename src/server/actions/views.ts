"use server";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { savedViews } from "@/server/db/schema";
import { requireOrgContext } from "@/server/context";
import { can } from "@/lib/permissions";
import { fail } from "./result";

/**
 * Saved views: a named snapshot of how someone likes to look at a table —
 * which columns, which filters, which sort. Personal by default; sharing one
 * with the workspace is a configuration act and needs the matching permission.
 */
const viewConfigSchema = z.object({
  hidden: z.array(z.string()).default([]),
  filters: z.record(z.string(), z.string()).default({}),
  sort: z.object({ key: z.string(), dir: z.enum(["asc", "desc"]) }).nullable().default(null),
  pageSize: z.number().int().positive().max(500).default(25),
  query: z.string().default(""),
});

type ViewConfig = z.infer<typeof viewConfigSchema>;

export type SavedViewSummary = { id: string; name: string; shared: boolean; config: ViewConfig; mine: boolean };

export async function listSavedViewsAction(entityType: string) {
  try {
    const ctx = await requireOrgContext();
    const rows = await db.select().from(savedViews)
      .where(and(
        eq(savedViews.orgId, ctx.org.id),
        eq(savedViews.entityType, entityType),
        // your own views, plus anything shared with the workspace
        or(isNull(savedViews.userId), eq(savedViews.userId, ctx.user.id)),
      ))
      .orderBy(asc(savedViews.name));

    return {
      ok: true as const,
      data: rows.map<SavedViewSummary>((r) => ({
        id: r.id,
        name: r.name,
        shared: r.userId === null,
        mine: r.userId === ctx.user.id,
        config: viewConfigSchema.parse(r.config ?? {}),
      })),
    };
  } catch (error) { return fail(error); }
}

export async function saveViewAction(input: unknown) {
  try {
    const ctx = await requireOrgContext();
    const parsed = z.object({
      entityType: z.string().min(1),
      name: z.string().min(1, "Give the view a name").max(60),
      shared: z.boolean().default(false),
      config: viewConfigSchema,
    }).parse(input);

    if (parsed.shared && !can(ctx.role, "config:manage")) {
      return { ok: false as const, error: "Only an admin can share a view with the whole workspace." };
    }

    // A stray loop should not be able to fill the table.
    const existing = await db.select({ id: savedViews.id }).from(savedViews)
      .where(and(
        eq(savedViews.orgId, ctx.org.id),
        eq(savedViews.entityType, parsed.entityType),
        or(isNull(savedViews.userId), eq(savedViews.userId, ctx.user.id)),
      ));
    if (existing.length >= 50) {
      return { ok: false as const, error: "You already have 50 saved views for this table. Delete one first." };
    }

    const [row] = await db.insert(savedViews).values({
      orgId: ctx.org.id,
      userId: parsed.shared ? null : ctx.user.id,
      entityType: parsed.entityType,
      name: parsed.name.trim(),
      config: parsed.config as never,
    }).returning();

    return { ok: true as const, data: { id: row.id } };
  } catch (error) { return fail(error); }
}

export async function deleteViewAction(id: string) {
  try {
    const ctx = await requireOrgContext();
    const [row] = await db.select().from(savedViews)
      .where(and(eq(savedViews.orgId, ctx.org.id), eq(savedViews.id, id))).limit(1);
    if (!row) return { ok: false as const, error: "That view no longer exists." };


    // Your own views are yours; a shared one belongs to the workspace.
    if (row.userId !== ctx.user.id && !can(ctx.role, "config:manage")) {
      return { ok: false as const, error: "Only an admin can delete a shared view." };
    }

    // org predicate repeated so the guarantee lives in the statement itself
    await db.delete(savedViews).where(and(eq(savedViews.orgId, ctx.org.id), eq(savedViews.id, id)));
    return { ok: true as const };
  } catch (error) { return fail(error); }
}
