import { z } from "zod";

/** The only place in the codebase that reads process.env. */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  /**
   * "local"    — writes to STORAGE_LOCAL_DIR. Fine on a server with a real disk.
   * "database" — stores bytes in Postgres. Required on serverless hosts, whose
   *              filesystems are wiped between requests.
   */
  STORAGE_DRIVER: z.enum(["local", "database"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  /** Public address of the deployment. Used to build reset links from the CLI. */
  APP_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  · ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
