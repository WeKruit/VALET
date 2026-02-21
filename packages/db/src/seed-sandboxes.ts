import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';
import { sandboxes } from './schema/sandboxes.js';

/**
 * Seed script to register existing EC2 sandbox instances
 * Run with: DATABASE_URL=... pnpm --filter @valet/db exec tsx src/seed-sandboxes.ts
 */

const connectionString =
  process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_DIRECT_URL or DATABASE_URL must be set');
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql, { schema });

console.log('🌱 Seeding sandboxes...');

try {
  // Register the current dev EC2 instance
  const [devSandbox] = await db
    .insert(sandboxes)
    .values({
      name: 'dev-sandbox-1',
      environment: 'dev',
      instanceId: 'i-0428f12557f075129',
      instanceType: 't3.large',
      publicIp: '34.197.248.80',
      status: 'active',
      healthStatus: 'healthy',
      capacity: 5,
      currentLoad: 0,
      sshKeyName: 'valet-worker.pem',
      novncUrl: 'http://34.197.248.80:6080',
      adspowerVersion: '7.12.29',
      tags: {
        purpose: 'development',
        region: 'us-east-1',
        terraform_managed: true,
      },
    })
    .onConflictDoUpdate({
      target: sandboxes.instanceId,
      set: {
        name: 'dev-sandbox-1',
        publicIp: '34.197.248.80',
        status: 'active',
        healthStatus: 'healthy',
        capacity: 5,
        novncUrl: 'http://34.197.248.80:6080',
        adspowerVersion: '7.12.29',
        updatedAt: new Date(),
      },
    })
    .returning();

  console.log('✅ Dev sandbox registered:', devSandbox);

  // You can add staging/production sandboxes here when ready
  // Example:
  // await db.insert(sandboxes).values({
  //   name: 'staging-sandbox-1',
  //   environment: 'staging',
  //   instanceId: 'i-xxxxx',
  //   instanceType: 't3.large',
  //   publicIp: 'xxx.xxx.xxx.xxx',
  //   ...
  // });

  console.log('✅ Sandbox seeding complete!');
} catch (error) {
  console.error('❌ Seed failed:', error);
  process.exit(1);
} finally {
  await sql.end();
}
