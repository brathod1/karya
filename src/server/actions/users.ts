"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability } from "@/server/context";
import { changeMemberRole, inviteMember, removeMember } from "@/server/domain/members";
import { issueResetToken, RESET_TOKEN_TTL_MINUTES } from "@/server/domain/passwordReset";
import { db } from "@/server/db";
import { memberships } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { fail } from "./result";

const roleSchema = z.enum(["OWNER", "ADMIN", "STAFF", "VIEWER"]);

export async function inviteMemberAction(input: unknown) {
  try {
    const ctx = await requireCapability("user:manage");
    const parsed = z.object({
      email: z.string().email("Enter a valid email address"),
      role: roleSchema,
    }).parse(input);

    const result = await inviteMember({
      orgId: ctx.org.id, actor: ctx.actor, actorRole: ctx.role,
      email: parsed.email, role: parsed.role,
    });

    revalidatePath("/settings/users");
    return { ok: true as const, data: { activatedImmediately: result.activatedImmediately } };
  } catch (error) { return fail(error); }
}

export async function changeMemberRoleAction(membershipId: string, role: unknown) {
  try {
    const ctx = await requireCapability("user:manage");
    await changeMemberRole({
      orgId: ctx.org.id, actor: ctx.actor, actorRole: ctx.role, actorUserId: ctx.user.id,
      membershipId, role: roleSchema.parse(role),
    });
    revalidatePath("/settings/users");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function removeMemberAction(membershipId: string) {
  try {
    const ctx = await requireCapability("user:manage");
    await removeMember({
      orgId: ctx.org.id, actor: ctx.actor, actorRole: ctx.role,
      actorUserId: ctx.user.id, membershipId,
    });
    revalidatePath("/settings/users");
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

/**
 * Issues a password-reset link for a member and hands it back to the admin to
 * deliver however they already talk to that person. No email is sent, and the
 * UI says so — pretending otherwise would leave someone waiting for a message
 * that never arrives.
 */
export async function issueResetLinkAction(membershipId: string) {
  try {
    const ctx = await requireCapability("user:manage");

    const [row] = await db.select().from(memberships)
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.id, membershipId))).limit(1);
    if (!row?.userId) {
      return { ok: false as const, error: "That person hasn't created their account yet, so there's no password to reset." };
    }
    if (row.role === "OWNER" && ctx.role !== "OWNER") {
      return { ok: false as const, error: "Only the owner can reset the owner's password." };
    }

    const { token, expiresAt } = await issueResetToken({
      userId: row.userId, issuedByUserId: ctx.user.id, orgId: ctx.org.id, actor: ctx.actor,
    });

    return {
      ok: true as const,
      data: { path: `/reset-password?token=${token}`, expiresAt: expiresAt.toISOString(), ttlMinutes: RESET_TOKEN_TTL_MINUTES },
    };
  } catch (error) { return fail(error); }
}
