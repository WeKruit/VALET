import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import { users } from "./schema/users.js";

/**
 * Seed script to create or promote a test admin user.
 * Run with: pnpm --filter @valet/db exec tsx src/seed-admin-user.ts
 */

const connectionString =
  process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_DIRECT_URL or DATABASE_URL must be set");
  process.exit(1);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@valet.dev";

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql, { schema });

console.log(`Seeding admin user (${ADMIN_EMAIL})...`);

try {
  // Check if user already exists
  const existing = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing[0]) {
    // Promote existing user to admin
    await db
      .update(users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(users.id, existing[0].id));
    console.log(`Promoted existing user ${ADMIN_EMAIL} to admin (was: ${existing[0].role})`);
  } else {
    // Create new admin user
    const [created] = await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        name: "Admin",
        role: "admin",
        emailVerified: true,
        isActive: true,
      })
      .returning({ id: users.id, email: users.email, role: users.role });
    console.log("Created admin user:", created);
  }

  console.log("Admin seed complete!");
} catch (error) {
  console.error("Admin seed failed:", error);
  process.exit(1);
} finally {
  await sql.end();
}
