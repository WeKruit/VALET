import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // UI package tests need jsdom for React components
  {
    test: {
      name: "ui",
      include: ["packages/ui/src/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      globals: true,
      setupFiles: ["packages/ui/src/test-setup.ts"],
    },
  },
  // Web app tests also need jsdom
  {
    test: {
      name: "web",
      include: ["apps/web/src/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      globals: true,
      setupFiles: ["apps/web/src/test-setup.ts"],
      alias: {
        "@/": new URL("./apps/web/src/", import.meta.url).pathname,
        "@valet/ui/components/": new URL("./packages/ui/src/components/", import.meta.url).pathname,
        "@valet/ui/lib/": new URL("./packages/ui/src/lib/", import.meta.url).pathname,
        "@valet/contracts": new URL("./packages/contracts/src/index.ts", import.meta.url).pathname,
        "@valet/shared/schemas": new URL("./packages/shared/src/schemas/index.ts", import.meta.url).pathname,
        "@valet/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      },
    },
  },
  // API and worker tests use node environment
  {
    test: {
      name: "api",
      include: [
        "apps/api/src/**/*.test.{ts,tsx}",
        "apps/api/tests/**/*.test.{ts,tsx}",
      ],
      environment: "node",
      globals: true,
    },
  },
  {
    test: {
      name: "worker",
      include: ["apps/worker/src/**/*.test.{ts,tsx}"],
      environment: "node",
      globals: true,
    },
  },
  // Shared packages use node environment
  {
    test: {
      name: "packages",
      include: [
        "packages/shared/src/**/*.test.{ts,tsx}",
        "packages/contracts/src/**/*.test.{ts,tsx}",
        "packages/db/src/**/*.test.{ts,tsx}",
        "packages/llm/src/**/*.test.{ts,tsx}",
      ],
      environment: "node",
      globals: true,
    },
  },
  // Root-level test fixtures and integration smoke tests
  {
    test: {
      name: "fixtures",
      include: ["tests/**/*.test.{ts,tsx}"],
      exclude: ["tests/e2e/**"],
      environment: "node",
      globals: true,
    },
  },
]);
