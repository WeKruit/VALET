import type { Pool } from "pg";

/**
 * List of tables to truncate between tests (in dependency order).
 * Add new tables here as the schema grows.
 */
const TABLES_TO_TRUNCATE = [
  "application_results",
  "task_events",
  "tasks",
  "consent_records",
  "qa_entries",
  "resumes",
  "user_preferences",
  "sessions",
  "users",
] as const;

/**
 * Truncate all application tables, resetting the database to a clean state.
 * Uses TRUNCATE ... CASCADE for speed (faster than DELETE).
 * Call this in beforeEach() or afterEach() hooks.
 */
export async function resetDatabase(pool: Pool): Promise<void> {
  const tableList = TABLES_TO_TRUNCATE.join(", ");
  await pool.query(`TRUNCATE TABLE ${tableList} CASCADE`);
}

/**
 * Truncate specific tables only.
 * Useful when you want to keep seed data in some tables.
 */
export async function truncateTables(
  pool: Pool,
  tables: string[],
): Promise<void> {
  if (tables.length === 0) return;
  const tableList = tables.join(", ");
  await pool.query(`TRUNCATE TABLE ${tableList} CASCADE`);
}

/**
 * Check that the database is reachable and migrations have been run.
 * Useful as a pre-flight check in test setup.
 */
export async function assertDatabaseReady(pool: Pool): Promise<void> {
  const result = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const tables = result.rows.map((r: { tablename: string }) => r.tablename);

  if (!tables.includes("users")) {
    throw new Error(
      "Database is not ready: 'users' table not found. Run migrations first.",
    );
  }
}

/**
 * Get row counts for all application tables.
 * Useful for debugging test state.
 */
export async function getTableCounts(
  pool: Pool,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES_TO_TRUNCATE) {
    const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
    counts[table] = parseInt(result.rows[0].count, 10);
  }
  return counts;
}
