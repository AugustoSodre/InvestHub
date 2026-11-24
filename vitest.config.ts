import { defineConfig } from "vitest/config";

const INTEGRATION_TESTS = ["src/**/*.int.test.ts", "test/**/*.int.test.ts"];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Every file gets MSW with unhandled requests turned into errors.
    setupFiles: ["test/setup/msw.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "test/**/*.test.ts"],
          exclude: INTEGRATION_TESTS,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: INTEGRATION_TESTS,
          // One Postgres container per run, migrations applied once to a template database.
          globalSetup: ["test/setup/postgres-global.ts"],
          // Each test file gets its own database cloned from the template.
          setupFiles: ["test/setup/test-database.ts"],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
