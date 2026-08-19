import { eq } from "drizzle-orm";
import { requireCapability } from "@/server/context";
import { db } from "@/server/db";
import { memberships, users } from "@/server/db/schema";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { UsersManager } from "./users-manager";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/permissions";

export default async function UsersPage() {
  const ctx = await requireCapability("user:manage");
  const rows = await db
    .select({ membership: memberships, user: users })
    .from(memberships)
    .leftJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.orgId, ctx.org.id));

  return (
    <div className="space-y-4 max-w-3xl">
      <UsersManager
        currentUserId={ctx.user.id}
        currentRole={ctx.role}
        members={rows.map((r) => ({
          id: r.membership.id,
          name: r.user?.name ?? null,
          email: r.user?.email ?? r.membership.invitedEmail ?? "",
          role: r.membership.role as Role,
          pending: !r.membership.userId,
          isSelf: r.membership.userId === ctx.user.id,
        })).sort((a, b) => a.email.localeCompare(b.email))}
      />

      <Card>
        <CardHeader title="What each role can do" />
        <CardBody className="space-y-3">
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <div key={role} className="rounded-lg bg-stone-50 px-3 py-2.5 ring-1 ring-line">
              <p className="text-[13px] font-medium">{ROLE_LABELS[role]}</p>
              <p className="text-[12px] text-ink-subtle">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
