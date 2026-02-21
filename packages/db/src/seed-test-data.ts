/**
 * Seed test data for integration and E2E testing.
 *
 * Creates:
 *   - 1 admin user (admin@test.com, role: admin)
 *   - 1 regular user (user@test.com, role: user)
 *   - 3 sandboxes with different health states
 *
 * Usage:
 *   pnpm --filter @valet/db exec tsx src/seed-test-data.ts
 *
 * Environment:
 *   DATABASE_URL or DATABASE_DIRECT_URL must be set.
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Load .env from monorepo root
const envPath = resolve(import.meta.dirname, "../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

import { eq } from "drizzle-orm";
import { createDatabase } from "./client.js";
import { users } from "./schema/users.js";
import { sandboxes } from "./schema/sandboxes.js";

const connectionString =
  process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or DATABASE_DIRECT_URL must be set");
  process.exit(1);
}

const { db, sql } = createDatabase(connectionString);

async function seed() {
  console.log("Seeding test data...");

  // ─── Users ───

  const adminEmail = "admin@test.com";
  const userEmail = "user@test.com";

  // Upsert admin user
  const existingAdmin = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  let adminId: string;
  if (existingAdmin[0]) {
    adminId = existingAdmin[0].id;
    await db
      .update(users)
      .set({ role: "admin", name: "Test Admin", isActive: true })
      .where(eq(users.id, adminId));
    console.log(`  Updated existing admin user: ${adminEmail} (${adminId})`);
  } else {
    const created = await db
      .insert(users)
      .values({
        email: adminEmail,
        name: "Test Admin",
        role: "admin",
        emailVerified: true,
        isActive: true,
      })
      .returning({ id: users.id });
    adminId = created[0]!.id;
    console.log(`  Created admin user: ${adminEmail} (${adminId})`);
  }

  // Upsert regular user
  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, userEmail))
    .limit(1);

  let userId: string;
  if (existingUser[0]) {
    userId = existingUser[0].id;
    await db
      .update(users)
      .set({ role: "user", name: "Test User", isActive: true })
      .where(eq(users.id, userId));
    console.log(`  Updated existing regular user: ${userEmail} (${userId})`);
  } else {
    const created = await db
      .insert(users)
      .values({
        email: userEmail,
        name: "Test User",
        role: "user",
        emailVerified: true,
        isActive: true,
      })
      .returning({ id: users.id });
    userId = created[0]!.id;
    console.log(`  Created regular user: ${userEmail} (${userId})`);
  }

  // ─── Sandboxes ───

  const sandboxData = [
    {
      name: "dev-sandbox-1",
      environment: "dev" as const,
      instanceId: "i-test-dev-001",
      instanceType: "t3.medium",
      publicIp: "10.0.0.1",
      status: "active" as const,
      healthStatus: "healthy" as const,
      capacity: 5,
      browserEngine: "chromium" as const,
      adspowerVersion: null,
    },
    {
      name: "staging-sandbox-1",
      environment: "staging" as const,
      instanceId: "i-test-stg-001",
      instanceType: "t3.large",
      publicIp: "10.0.0.2",
      status: "active" as const,
      healthStatus: "degraded" as const,
      capacity: 10,
      browserEngine: "adspower" as const,
      adspowerVersion: "7.12.29",
    },
    {
      name: "prod-sandbox-1",
      environment: "prod" as const,
      instanceId: "i-test-prod-001",
      instanceType: "t3.xlarge",
      publicIp: "10.0.0.3",
      status: "active" as const,
      healthStatus: "unhealthy" as const,
      capacity: 15,
      browserEngine: "adspower" as const,
      adspowerVersion: "7.12.29",
    },
  ];

  for (const data of sandboxData) {
    const existing = await db
      .select({ id: sandboxes.id })
      .from(sandboxes)
      .where(eq(sandboxes.instanceId, data.instanceId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(sandboxes)
        .set({
          name: data.name,
          status: data.status,
          healthStatus: data.healthStatus,
          updatedAt: new Date(),
        })
        .where(eq(sandboxes.id, existing[0].id));
      console.log(`  Updated existing sandbox: ${data.name} (${existing[0].id})`);
    } else {
      const created = await db
        .insert(sandboxes)
        .values(data)
        .returning({ id: sandboxes.id });
      console.log(`  Created sandbox: ${data.name} (${created[0]!.id})`);
    }
  }

  console.log("\nTest data seeded successfully!");
  console.log(`  Admin user: ${adminEmail} (role: admin)`);
  console.log(`  Regular user: ${userEmail} (role: user)`);
  console.log(`  Sandboxes: ${sandboxData.length} created/updated`);
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
