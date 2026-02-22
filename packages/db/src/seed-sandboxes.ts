import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
import { sandboxes } from "./schema/sandboxes.js";

/**
 * Seed script to register the GhostHands ASG sandbox.
 * NOTE: ASG instances get dynamic IPs. This seed uses the current instance
 * as a starting point. For dynamic IP sync, see WEK-138.
 * Run with: DATABASE_URL=... pnpm --filter @valet/db exec tsx src/seed-sandboxes.ts
 */

const connectionString = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_DIRECT_URL or DATABASE_URL must be set");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql, { schema });

console.log("🌱 Seeding sandboxes...");

try {
  // Register the ASG-managed worker as staging sandbox
  // NOTE: instanceId and publicIp change when ASG replaces instances.
  // WEK-138 will add dynamic IP sync. For now, update manually after ASG refresh.
  const [stagingSandbox] = await db
    .insert(sandboxes)
    .values({
      name: "gh-worker-asg-1",
      environment: "staging",
      instanceId: "i-0baf28dd8bb630810",
      instanceType: "t3.large",
      publicIp: "44.198.167.49",
      status: "active",
      healthStatus: "healthy",
      capacity: 1,
      currentLoad: 0,
      sshKeyName: "valet-worker.pem",
      novncUrl: "http://44.198.167.49:6080",
      tags: {
        purpose: "staging",
        region: "us-east-1",
        asg_managed: true,
        asg_name: "ghosthands-worker-asg",
      },
    })
    .onConflictDoUpdate({
      target: sandboxes.instanceId,
      set: {
        name: "gh-worker-asg-1",
        environment: "staging",
        instanceType: "t3.large",
        publicIp: "44.198.167.49",
        status: "active",
        healthStatus: "healthy",
        capacity: 1,
        novncUrl: "http://44.198.167.49:6080",
        tags: {
          purpose: "staging",
          region: "us-east-1",
          asg_managed: true,
          asg_name: "ghosthands-worker-asg",
        },
        updatedAt: new Date(),
      },
    })
    .returning();

  console.log("✅ Staging sandbox registered:", stagingSandbox);

  console.log("✅ Sandbox seeding complete!");
} catch (error) {
  console.error("❌ Seed failed:", error);
  process.exit(1);
} finally {
  await sql.end();
}
