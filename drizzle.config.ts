import { readFileSync, existsSync } from "node:fs";
import type { Config } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env ourselves — no extra dependency.
if (!process.env.DATABASE_URL && existsSync(".env")) {
  for (const raw of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
  }
}

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
} satisfies Config;
