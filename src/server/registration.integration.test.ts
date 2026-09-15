import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, organizations, users } from "@/server/db/schema";
import { createWorkspaceAction, registerAction } from "@/server/actions/auth";
import { inviteMemberAction } from "@/server/actions/users";
import {
  ORG_NAME_PREFIX, closeDatabase, createOwnerWithWorkspace, createUserWithoutWorkspace, removeTestData, signInAs, signOut,
} from "@/test/integration/workspaces";

/**
 * Invitation-only sign-up (REGISTRATION unset, so the default "invite").
 *
 * Until email verification exists, an open sign-up form lets anyone claim any
 * address. These prove the form admits only invited addresses, and that an
 * account belonging to no workspace cannot start one.
 */

const isRedirect = { digest: expect.stringContaining("NEXT_REDIRECT") };

function signUpForm(email: string) {
  const form = new FormData();
  form.set("name", "Isolation invitee");
  form.set("email", email);
  form.set("password", "correct-horse-battery-staple");
  return form;
}

function workspaceForm(name: string) {
  const form = new FormData();
  form.set("name", name);
  form.set("template", "generic");
  return form;
}

async function userByEmail(email: string) {
  const [row] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
  return row;
}

beforeAll(removeTestData);

afterAll(async () => {
  signOut();
  try {
    await removeTestData();
  } finally {
    await closeDatabase();
  }
});

describe("sign-up while invitation-only", () => {
  it("refuses an address nobody invited, and creates no account", async () => {
    signOut();
    const email = `isolation-stranger-${randomUUID().slice(0, 8)}@example.test`;
    const result = await registerAction(null, signUpForm(email));
    expect(result.ok).toBe(false);
    expect(await userByEmail(email)).toBeUndefined();
  });

  it("admits an invited address and joins it to the inviting workspace", async () => {
    const owner = await createOwnerWithWorkspace("Inviter");
    const email = `isolation-invitee-${owner.tag}@example.test`;

    await signInAs(owner.userId, owner.orgId);
    expect((await inviteMemberAction({ email, role: "STAFF" })).ok).toBe(true);

    signOut();
    await expect(registerAction(null, signUpForm(email))).rejects.toMatchObject(isRedirect);

    const user = await userByEmail(email);
    expect(user).toBeDefined();
    const [membership] = await db.select().from(memberships)
      .where(and(eq(memberships.orgId, owner.orgId), eq(memberships.userId, user!.id))).limit(1);
    expect(membership?.role).toBe("STAFF");
  });
});

describe("starting a workspace while invitation-only", () => {
  it("is refused for an account that belongs to no workspace", async () => {
    const loner = await createUserWithoutWorkspace("Loner");
    await signInAs(loner.userId, null);
    const name = `${ORG_NAME_PREFIX}refused ${randomUUID().slice(0, 8)}`;

    const result = await createWorkspaceAction(null, workspaceForm(name));
    expect(result.ok).toBe(false);
    expect(await db.select().from(organizations).where(eq(organizations.name, name))).toEqual([]);
  });

  it("is allowed for someone already in a workspace (how a new business is set up by hand)", async () => {
    const owner = await createOwnerWithWorkspace("Onboarder");
    await signInAs(owner.userId, owner.orgId);
    const name = `${ORG_NAME_PREFIX}second ${owner.tag}`;

    await expect(createWorkspaceAction(null, workspaceForm(name))).rejects.toMatchObject(isRedirect);
    expect(await db.select().from(organizations).where(eq(organizations.name, name))).toHaveLength(1);
  });
});
