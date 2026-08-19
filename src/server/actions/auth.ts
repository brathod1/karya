"use server";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { clearSessionCookie, setSessionCookie } from "@/server/session";
import { getCurrentUser, getMemberships } from "@/server/context";
import { createOrganization } from "@/server/domain/provisioning";
import type { TemplateKey } from "@/server/domain/templates";
import { claimInvitations } from "@/server/domain/members";
import { fail } from "./result";
import { AUTH_LIMITS, clearAttempts, clientIp, guardAuthAttempt, recordAttempt } from "@/server/rate-limit";
import { consumeResetToken } from "@/server/domain/passwordReset";

const credentials = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = credentials.extend({ name: z.string().min(1, "Enter your name") }).safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
  });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const ip = await clientIp();
  const guard = await guardAuthAttempt(parsed.data.email, ip, { ip: AUTH_LIMITS.registerPerIp });
  if (guard.blocked) return { ok: false as const, error: guard.message };
  await recordAttempt("ip", ip);

  const [existing] = await db.select({ id: users.id }).from(users)
    .where(sql`lower(${users.email}) = ${parsed.data.email}`).limit(1);
  if (existing) return { ok: false as const, error: "An account with that email already exists." };

  // `redirect()` works by throwing, so it must never sit inside this try/catch.
  let joinedExistingWorkspace = false;
  try {
    const [user] = await db.insert(users).values({
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
    }).returning();

    // Someone may have invited this address before the person signed up.
    const claimed = await claimInvitations(db, user.id, user.email);
    joinedExistingWorkspace = claimed.length > 0;
    await setSessionCookie({ userId: user.id, orgId: claimed[0]?.orgId ?? null, v: user.sessionVersion });
  } catch (error) {
    return fail(error);
  }

  redirect(joinedExistingWorkspace ? "/dashboard" : "/onboarding");
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  // Throttled per email and per device, so a script cannot sit and guess.
  const ip = await clientIp();
  const guard = await guardAuthAttempt(parsed.data.email, ip, {
    email: AUTH_LIMITS.perEmail, ip: AUTH_LIMITS.perIp,
  });
  if (guard.blocked) return { ok: false as const, error: guard.message };

  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${parsed.data.email}`).limit(1);
  // Same message for unknown email and wrong password — no account enumeration.
  const invalid = { ok: false as const, error: "Email or password is incorrect." };

  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    await recordAttempt("email", parsed.data.email);
    await recordAttempt("ip", ip);
    return invalid;
  }

  // A correct password clears the counter, so one forgotten password today
  // does not lock the account out tomorrow.
  await clearAttempts("email", parsed.data.email);
  await claimInvitations(db, user.id, user.email);
  const memberships = await getMemberships(user.id);
  await setSessionCookie({ userId: user.id, orgId: memberships[0]?.org.id ?? null, v: user.sessionVersion });
  redirect(memberships.length ? "/dashboard" : "/onboarding");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

export async function createWorkspaceAction(_prev: unknown, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const templateKey = String(formData.get("template") ?? "generic") as TemplateKey;
  const businessType = String(formData.get("businessType") ?? "").trim() || null;
  if (!name) return { ok: false as const, error: "Give your business a name." };

  try {
    const org = await createOrganization({ userId: user.id, name, templateKey, businessType });
    await setSessionCookie({ userId: user.id, orgId: org.id, v: user.sessionVersion });
  } catch (error) {
    return fail(error);
  }
  redirect("/dashboard");
}

export async function switchWorkspaceAction(orgId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const memberships = await getMemberships(user.id);
  if (!memberships.some((m) => m.org.id === orgId)) return;
  await setSessionCookie({ userId: user.id, orgId, v: user.sessionVersion });
  redirect("/dashboard");
}

export async function changePasswordAction(currentPassword: string, newPassword: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (newPassword.length < 8) return { ok: false as const, error: "New password must be at least 8 characters." };
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { ok: false as const, error: "Your current password is incorrect." };
  }
  // Bumping sessionVersion invalidates every cookie already issued.
  await db.update(users).set({
    passwordHash: await bcrypt.hash(newPassword, 12),
    sessionVersion: user.sessionVersion + 1,
  }).where(eq(users.id, user.id));
  await setSessionCookie({ userId: user.id, orgId: null, v: user.sessionVersion + 1 });
  return { ok: true as const };
}

/** Completes a reset started from an admin-issued link. */
export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) return { ok: false as const, error: "Those two passwords don't match." };

  // Throttled on the token itself, so a link cannot be brute-forced.
  const ip = await clientIp();
  const guard = await guardAuthAttempt(token.slice(0, 24), ip, { email: AUTH_LIMITS.perEmail, ip: AUTH_LIMITS.perIp });
  if (guard.blocked) return { ok: false as const, error: guard.message };

  try {
    await consumeResetToken(token, password);
    await clearAttempts("ip", ip);
  } catch (error) {
    await recordAttempt("email", token.slice(0, 24));
    await recordAttempt("ip", ip);
    return fail(error);
  }

  redirect("/login?reset=1");
}
