import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration tests: real Postgres, real domain code, real server actions.
 *
 * Kept apart from `npm test` so the unit suite still runs with no database.
 * Run with `npm run test:integration`. The setup file refuses to start against
 * the production database.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["src/test/integration/setup.ts"],
    // Every statement is a round trip to a remote database.
    testTimeout: 60_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
