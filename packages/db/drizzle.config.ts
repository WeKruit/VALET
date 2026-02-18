import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Load .env from monorepo root (2 levels up from packages/db)
const envPath = resolve(__dirname, "../../.env");
try {
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env file is optional (env vars may be set directly)
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Session pooler for migrations (IPv4-compatible, supports DDL)
    url:
      process.env["DATABASE_DIRECT_URL"] ??
      process.env["DATABASE_URL"] ??
      "postgres://wekruit:wekruit_dev@localhost:5432/wekruit",
  },
  // Only manage VALET tables
  tablesFilter: [
    "users",
    "resumes",
    "tasks",
    "task_events",
    "qa_bank",
    "consent_records",
    "audit_trail",
    "application_fields",
    "application_results",
    "browser_profiles",
    "proxy_bindings",
    "notifications",
    "action_manuals",
    "manual_steps",
    "sandboxes",
    "gh_automation_jobs",
    "gh_browser_sessions",
    "gh_job_events",
    // "sandbox_secrets" — deprecated, excluded from drizzle-kit management
  ],
});
