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
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
} finally {
  await sql.end();
}
