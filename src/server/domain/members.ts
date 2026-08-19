import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, type Exec } from "@/server/db";
import { memberships, users } from "@/server/db/schema";
import { logAudit, type Actor } from "./audit";
import { mustExist } from "@/server/db/tenant";
import type { Role } from "@/lib/permissions";

/**
 * Membership management.
 *
 * There is no email delivery in this application, so an "invite" is a pending
 * membership keyed on an email address. It activates the moment that person
 * registers or signs in with that address. The UI says so plainly rather than
 * implying a message was sent.
 */

export async function inviteMember(args: {
  orgId: string; actor: Actor; actorRole: Role; email: string; role: Role;
}) {
  const email = args.email.trim().toLowerCase();
  if (!email) throw new Error("Enter an email address.");
  if (args.role === "OWNER" && args.actorRole !== "OWNER") {
    throw new Error("Only the owner can make someone else an owner.");
  }

  return db.transaction(async (tx) => {
    const [existingUser] = await tx.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);

    if (existingUser) {
      const [already] = await tx.select().from(memberships)
        .where(and(eq(memberships.orgId, args.orgId), eq(memberships.userId, existingUser.id))).limit(1);
      if (already) throw new Error("That person is already a member of this workspace.");
    } else {
      const [pending] = await tx.select().from(memberships)
        .where(and(
          eq(memberships.orgId, args.orgId),
          isNull(memberships.userId),
          sql`lower(${memberships.invitedEmail}) = ${email}`,
        )).limit(1);
      if (pending) throw new Error("That email has already been invited.");
    }

    const [row] = await tx.insert(memberships).values({
      orgId: args.orgId,
      userId: existingUser?.id ?? null,
      invitedEmail: email,
      role: args.role,
      acceptedAt: existingUser ? new Date() : null,
    }).returning();

    await logAudit(tx, {
      orgId: args.orgId, actor: args.actor, action: "member.invite",
      entityType: "Membership", entityId: row.id,
      after: { email, role: args.role, active: !!existingUser },
    });

    return { membership: row, activatedImmediately: !!existingUser };
  });
}

/** Called on register and on sign-in: turns pending invitations into real memberships. */
export async function claimInvitations(tx: Exec, userId: string, email: string) {
  const normalised = email.trim().toLowerCase();
  const claimed = await tx.update(memberships)
    .set({ userId, acceptedAt: new Date() })
    .where(and(isNull(memberships.userId), sql`lower(${memberships.invitedEmail}) = ${normalised}`))
    .returning({ id: memberships.id, orgId: memberships.orgId });
  return claimed;
}

async function countOwners(tx: Exec, orgId: string) {
  const rows = await tx.select({ id: memberships.id }).from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "OWNER")));
  return rows.length;
}

export async function changeMemberRole(args: {
  orgId: string; actor: Actor; actorRole: Role; actorUserId: string; membershipId: string; role: Role;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(memberships)
      .where(and(eq(memberships.orgId, args.orgId), eq(memberships.id, args.membershipId))).limit(1);
    mustExist(row, "Member");

    if (args.role === "OWNER" && args.actorRole !== "OWNER") {
      throw new Error("Only the owner can make someone else an owner.");
    }
    // The workspace must never be left without an owner.
    if (row.role === "OWNER" && args.role !== "OWNER" && (await countOwners(tx, args.orgId)) <= 1) {
      throw new Error("This is the only owner. Make someone else an owner first.");
    }
    if (row.role === "OWNER" && args.actorRole !== "OWNER") {
      throw new Error("Only the owner can change the owner's role.");
    }

    await tx.update(memberships).set({ role: args.role }).where(eq(memberships.id, args.membershipId));
    await logAudit(tx, {
      orgId: args.orgId, actor: args.actor, action: "member.role",
      entityType: "Membership", entityId: args.membershipId,
      before: { role: row.role }, after: { role: args.role },
    });
  });
}

export async function removeMember(args: {
  orgId: string; actor: Actor; actorRole: Role; actorUserId: string; membershipId: string;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(memberships)
      .where(and(eq(memberships.orgId, args.orgId), eq(memberships.id, args.membershipId))).limit(1);
    mustExist(row, "Member");

    if (row.userId === args.actorUserId) throw new Error("You cannot remove yourself from the workspace.");
    if (row.role === "OWNER" && (await countOwners(tx, args.orgId)) <= 1) {
      throw new Error("You cannot remove the only owner.");
    }
    if (row.role === "OWNER" && args.actorRole !== "OWNER") {
      throw new Error("Only the owner can remove an owner.");
    }

    await tx.delete(memberships).where(eq(memberships.id, args.membershipId));
    await logAudit(tx, {
      orgId: args.orgId, actor: args.actor, action: "member.remove",
      entityType: "Membership", entityId: args.membershipId,
      before: { role: row.role, userId: row.userId, invitedEmail: row.invitedEmail },
    });
  });
}
