import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = process.env["DATABASE_DIRECT_URL"] ?? process.env["DATABASE_URL"];

if (!connectionString) {
  console.error("DATABASE_DIRECT_URL or DATABASE_URL must be set");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, connect_timeout: 30, idle_timeout: 30 });
const db = drizzle(sql);

const migrationsFolder = resolve(__dirname, "../drizzle");

console.log(`Running migrations from ${migrationsFolder}...`);

try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations completed successfully");
} catch (error: unknown) {
  // When staging and production share the same database, the migration DDL may
  // already be applied but Drizzle tries to INSERT the journal record and hits
  // a PK constraint. In this case the DDL was already executed by the other
  // environment, so it is safe to skip.
  //
  // IMPORTANT: We only skip the journal-insert duplicate. If the DDL itself
  // failed we must NOT swallow the error — that would leave the schema out of
  // sync while the journal records the migration as applied.
  const isPkDuplicate =
    error instanceof Error &&
    error.message.includes("duplicate key value violates unique constraint") &&
    error.message.includes("__drizzle_migrations");
  if (isPkDuplicate) {
    console.log("Migrations already applied (shared database) — skipping");
  } else {
    console.error("Migration failed:", error);
    process.exit(1);
  }
} finally {
  await sql.end();
}
