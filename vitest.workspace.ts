import { defineWorkspace } from "vitest/config";

/**
 * Vitest workspace configuration for WeKruit Valet monorepo.
 *
 * This workspace ties together all vitest.config.ts files across packages and apps.
 * Each project runs in its own isolated environment with project-specific settings.
 *
 * Run tests: pnpm test
 * Run tests in watch mode: pnpm exec vitest --workspace vitest.workspace.ts
 */
export default defineWorkspace([
  // Root-level config (if any tests exist here)
  "./vitest.config.ts",

  // Apps
  "./apps/api/vitest.config.ts",
  "./apps/web/vitest.config.ts",

  // Packages
  "./packages/ui/vitest.config.ts",

  // Note: packages/shared, packages/contracts, packages/db, packages/llm
  // don't have test scripts or vitest configs yet. Add them here when created.
]);
