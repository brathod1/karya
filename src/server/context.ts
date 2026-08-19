import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, organizations, users, type Organization, type User } from "@/server/db/schema";
import { readSession } from "@/server/session";
import { can, type Capability, type Role } from "@/lib/permissions";
import { getOrgConfig, type OrgConfig } from "@/server/domain/config";
import type { ModuleKey } from "@/lib/settings";

export type OrgContext = {
  user: Pick<User, "id" | "name" | "email">;
  org: Organization;
  role: Role;
  config: OrgConfig;
  actor: { userId: string; name: string };
  /**
   * Every workspace this user belongs to. Carried here because the session
   * lookup already joined them — the workspace switcher asking again was a
   * second round trip for rows we were holding.
   */
  workspaces: { id: string; name: string; current: boolean }[];
};

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await readSession();
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;
  if (user.sessionVersion !== session.v) return null; // password change / sign-out-everywhere
  return user;
});

export const getMemberships = cache(async (userId: string) => {
  return db
    .select({ membership: memberships, org: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(organizations.name));
});

/**
 * The user, their memberships and the organisations they belong to, in one
 * statement.
 *
 * These used to be three dependent queries — and on a database a few hundred
 * milliseconds away, three waits before a page could even start doing its own
 * work. The session already tells us who to look up; the join does the rest.
 */
const getSessionBundle = cache(async (userId: string) => {
  const rows = await db
    .select({ user: users, membership: memberships, org: organizations })
    .from(users)
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .leftJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(eq(users.id, userId))
    .orderBy(asc(organizations.name));

  if (rows.length === 0) return null;
  return {
    user: rows[0].user,
    memberships: rows
      .filter((r) => r.membership && r.org)
      .map((r) => ({ membership: r.membership!, org: r.org! })),
  };
});

/**
 * The first line of every protected page and server action.
 * Resolves session → user → membership → organisation → configuration.
 */
export const requireOrgContext = cache(async (): Promise<OrgContext> => {
  const session = await readSession();
  if (!session) redirect("/login");

  const bundle = await getSessionBundle(session.userId);
  if (!bundle) redirect("/login");

  const { user, memberships: list } = bundle;
  if (user.sessionVersion !== session.v) redirect("/login");
  if (list.length === 0) redirect("/onboarding");

  const chosen = list.find((m) => m.org.id === session.orgId) ?? list[0];
  const config = await getOrgConfig(chosen.org.id, chosen.org);

  return {
    user: { id: user.id, name: user.name, email: user.email },
    org: chosen.org,
    role: chosen.membership.role as Role,
    config,
    actor: { userId: user.id, name: user.name },
    workspaces: list.map((m) => ({ id: m.org.id, name: m.org.name, current: m.org.id === chosen.org.id })),
  };
});

export async function requireCapability(capability: Capability): Promise<OrgContext> {
  const ctx = await requireOrgContext();
  if (!can(ctx.role, capability)) {
    const err = new Error(`Your role (${ctx.role}) cannot perform this action.`) as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return ctx;
}

/**
 * Route-level module gate. A bookmarked URL for a disabled module must 404 —
 * hiding the nav item alone is not a control.
 */
export async function requireModule(module: ModuleKey): Promise<OrgContext> {
  const ctx = await requireOrgContext();
  if (!ctx.config.settings.modules[module]) notFound();
  return ctx;
}

export async function assertMembership(orgId: string, userId: string): Promise<Role> {
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (!row) notFound();
  return row.role as Role;
}
