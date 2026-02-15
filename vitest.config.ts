import { defineConfig } from "vitest/config";

/**
 * Root vitest configuration for WeKruit Valet monorepo.
 * Uses test.projects to configure each workspace package separately.
 */
export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    testTimeout: 10_000,
    hookTimeout: 30_000,
    pool: "forks",
    // Exclude Playwright E2E tests (*.spec.ts) - they run separately via playwright command
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.spec.ts", // Playwright E2E tests
      "tests/e2e/**", // E2E test directory
      "apps/*/tests/e2e/**", // App-specific E2E directories
    ],
    // Project-based configuration for each workspace
    projects: [
      {
        name: "root",
        test: {
          include: ["tests/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        name: "@valet/api",
        test: {
          include: ["apps/api/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        name: "@valet/web",
        test: {
          include: ["apps/web/src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["apps/web/src/test-setup.ts"],
        },
        resolve: {
          alias: {
            "@": new URL("./apps/web/src/", import.meta.url).pathname,
            "@valet/ui/components/": new URL("./packages/ui/src/components/", import.meta.url)
              .pathname,
            "@valet/ui/lib/": new URL("./packages/ui/src/lib/", import.meta.url).pathname,
            "@valet/contracts": new URL("./packages/contracts/src/index.ts", import.meta.url)
              .pathname,
            "@valet/shared/schemas": new URL(
              "./packages/shared/src/schemas/index.ts",
              import.meta.url,
            ).pathname,
            "@valet/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
          },
        },
      },
      {
        name: "@valet/ui",
        test: {
          include: ["packages/ui/src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["packages/ui/src/test-setup.ts"],
        },
        resolve: {
          alias: {
            "@": new URL("./packages/ui/src/", import.meta.url).pathname,
          },
        },
      },
    ],
  },
});
