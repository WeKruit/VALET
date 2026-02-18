import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Root vitest configuration for WeKruit Valet monorepo.
 * Uses test.projects to configure each workspace package separately.
 *
 * Note: path.resolve is used instead of new URL().pathname to avoid
 * URL-encoding issues when the repo path contains spaces or special chars.
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
            "@/": path.resolve(__dirname, "apps/web/src") + "/",
            "@valet/ui/components/": path.resolve(__dirname, "packages/ui/src/components") + "/",
            "@valet/ui/lib/": path.resolve(__dirname, "packages/ui/src/lib") + "/",
            "@valet/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
            "@valet/shared/schemas": path.resolve(
              __dirname,
              "packages/shared/src/schemas/index.ts",
            ),
            "@valet/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
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
            "@/": path.resolve(__dirname, "packages/ui/src") + "/",
          },
        },
      },
    ],
  },
});
