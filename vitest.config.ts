import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // See src/test/server-only-stub.ts
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Need a database; run with `npm run test:integration`.
    exclude: [...configDefaults.exclude, "src/**/*.integration.test.ts"],
  },
});
