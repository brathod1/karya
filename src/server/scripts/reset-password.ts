/**
 * Password reset from the command line.
 *
 *   npm run reset-password -- someone@example.com
 *
 * This exists for the owner, who has nobody above them to issue a link. It
 * needs access to the server and the database, which is the point: it is the
 * last resort, not a convenience.
 */
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { issueResetToken, RESET_TOKEN_TTL_MINUTES } from "@/server/domain/passwordReset";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run reset-password -- someone@example.com");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (!user) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }

  const { token } = await issueResetToken({ userId: user.id });
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  console.log(`
Reset link for ${user.name} <${user.email}> — valid for ${RESET_TOKEN_TTL_MINUTES} minutes,
single use, and it signs out every device once used:

  ${base}/reset-password?token=${token}

If APP_URL is not set, the address above assumes local development.
`);
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
