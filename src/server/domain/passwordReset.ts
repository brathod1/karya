import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { passwordResetTokens, users } from "@/server/db/schema";
import { logAudit, type Actor } from "./audit";

/**
 * Password reset without an email service.
 *
 * This application sends no mail, so a reset link is *issued* by an admin and
 * handed to the person directly — over WhatsApp, in person, however they
 * already talk. For the owner, who has nobody above them, there is a
 * command-line equivalent (`npm run reset-password`).
 *
 * The token itself is never stored: only its SHA-256 hash, so a database dump
 * yields no usable links.
 */

export const RESET_TOKEN_TTL_MINUTES = 60;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueResetToken(args: { userId: string; issuedByUserId?: string | null; orgId?: string; actor?: Actor }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await db.transaction(async (tx) => {
    // Issuing a new link invalidates any outstanding one for that person.
    await tx.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, args.userId), isNull(passwordResetTokens.usedAt)));

    await tx.insert(passwordResetTokens).values({
      userId: args.userId,
      tokenHash: hashToken(token),
      expiresAt,
      issuedByUserId: args.issuedByUserId ?? null,
    });

    if (args.orgId) {
      await logAudit(tx, {
        orgId: args.orgId, actor: args.actor, action: "password.reset.issued",
        entityType: "User", entityId: args.userId, after: { expiresAt },
      });
    }
  });

  return { token, expiresAt };
}

export type ResetTokenCheck =
  | { valid: true; userId: string; email: string; name: string }
  | { valid: false; reason: string };

export async function checkResetToken(token: string): Promise<ResetTokenCheck> {
  if (!token) return { valid: false, reason: "That link is not valid." };

  const [row] = await db
    .select({ token: passwordResetTokens, user: users })
    .from(passwordResetTokens)
    .innerJoin(users, eq(passwordResetTokens.userId, users.id))
    .where(and(
      eq(passwordResetTokens.tokenHash, hashToken(token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ))
    .limit(1);

  if (!row) return { valid: false, reason: "That link has expired or has already been used. Ask for a new one." };
  return { valid: true, userId: row.user.id, email: row.user.email, name: row.user.name };
}

export async function consumeResetToken(token: string, newPassword: string) {
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");

  const check = await checkResetToken(token);
  if (!check.valid) throw new Error(check.reason);

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      passwordHash: await bcrypt.hash(newPassword, 12),
      // Signs out every device that was using the old password.
      sessionVersion: sql`${users.sessionVersion} + 1`,
    }).where(eq(users.id, check.userId));

    await tx.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.tokenHash, hashToken(token)));
  });

  return { email: check.email };
}
