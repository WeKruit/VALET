import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Run tests across all workspace packages
    include: [
      "apps/*/src/**/*.test.{ts,tsx}",
      "apps/*/tests/**/*.test.{ts,tsx}",
      "packages/*/src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/e2e/**",
    ],
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "html"],
      include: [
        "apps/*/src/**/*.{ts,tsx}",
        "packages/*/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/tests/**",
        "**/test/**",
        "**/__mocks__/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/index.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 75,
        statements: 80,
      },
    },
    setupFiles: [],
    testTimeout: 10_000,
    hookTimeout: 30_000,
    pool: "forks",
    alias: {
      "@valet/shared": path.resolve(__dirname, "packages/shared/src"),
      "@valet/contracts": path.resolve(__dirname, "packages/contracts/src"),
      "@valet/db": path.resolve(__dirname, "packages/db/src"),
      "@valet/llm": path.resolve(__dirname, "packages/llm/src"),
      "@valet/ui": path.resolve(__dirname, "packages/ui/src"),
    },
  },
});
