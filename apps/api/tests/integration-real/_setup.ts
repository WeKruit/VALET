/**
 * Real integration test setup.
 *
 * Creates real DB (Drizzle + postgres.js) and Redis (ioredis) connections.
 * Gated behind INTEGRATION_TEST=true — skipped during normal `pnpm test`.
 */
import { createDatabase, type Database } from "@valet/db";
import type Sql from "postgres";
import Redis from "ioredis";

// ── Gate ──────────────────────────────────────────────────────────────
export function isAvailable(): boolean {
  return (
    process.env.INTEGRATION_TEST === "true" &&
    Boolean(process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL) &&
    Boolean(process.env.REDIS_URL)
  );
}

// ── DB ───────────────────────────────────────────────────────────────
let _db: Database | null = null;
let _sql: Sql.Sql | null = null;

export function getDb(): Database {
  if (!_db) {
    const connStr = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL!;
    const { db, sql } = createDatabase(connStr);
    _db = db;
    _sql = sql as unknown as Sql.Sql;
  }
  return _db;
}

/** Raw SQL helper (for TRUNCATE / ad-hoc queries the Drizzle API can't express). */
export function getSql(): Sql.Sql {
  getDb(); // ensure initialised
  return _sql!;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await (_sql as any).end();
    _sql = null;
    _db = null;
  }
}

// ── Redis ────────────────────────────────────────────────────────────
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL!;
    _redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      ...(url.startsWith("rediss://") && { tls: {} }),
    });
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

// ── Cleanup ──────────────────────────────────────────────────────────
const TEST_PREFIX = "test-integ-";

/**
 * Create a scoped cleanup/helper set for a specific test file.
 *
 * Each file gets its own prefix (e.g. `test-integ-sr-`, `test-integ-tl-`)
 * so parallel test files don't stomp each other's data.
 */
export function createTestScope(scope: string) {
  const prefix = `${TEST_PREFIX}${scope}-`;

  function scopedEmail(suffix: string): string {
    return `${prefix}${suffix}@test.local`;
  }

  async function cleanup(): Promise<void> {
    const sql = getSql();

    const safeDelete = async (query: string) => {
      try {
        await sql.unsafe(query);
      } catch {
        // Table may not exist — skip silently
      }
    };

    // Order matters: FK dependencies (children first)
    await safeDelete(
      `DELETE FROM user_sandboxes WHERE user_id IN (SELECT id FROM users WHERE email LIKE '${prefix}%')`,
    );
    await safeDelete(
      `DELETE FROM tasks WHERE user_id IN (SELECT id FROM users WHERE email LIKE '${prefix}%')`,
    );
    await safeDelete(`DELETE FROM users WHERE email LIKE '${prefix}%'`);
    await safeDelete(`DELETE FROM sandboxes WHERE name LIKE '${prefix}%'`);
  }

  return { prefix, scopedEmail, cleanup };
}

/** Generate a test user email that matches a scope prefix. */
export function testEmail(suffix: string, scope?: string): string {
  const pfx = scope ? `${TEST_PREFIX}${scope}-` : TEST_PREFIX;
  return `${pfx}${suffix}@test.local`;
}

// ── Seed helpers ─────────────────────────────────────────────────────
function randomUUID(): string {
  return crypto.randomUUID();
}

export interface TestSandbox {
  id: string;
  name: string;
  status: string;
  healthStatus: string;
  capacity: number;
}

export async function insertTestSandbox(
  overrides: Partial<TestSandbox & Record<string, unknown>> = {},
  scope?: string,
): Promise<TestSandbox> {
  const sql = getSql();
  const id = overrides.id ?? randomUUID();
  const pfx = scope ? `${TEST_PREFIX}${scope}-` : TEST_PREFIX;
  const name = overrides.name ?? `${pfx}sandbox-${id.slice(0, 8)}`;
  const status = overrides.status ?? "active";
  const healthStatus = overrides.healthStatus ?? "healthy";
  const capacity = overrides.capacity ?? 5;
  const instanceId = overrides.instanceId ?? `i-${id.slice(0, 17)}`;
  const instanceType = (overrides.instanceType as string) ?? "t3.large";
  const environment = (overrides.environment as string) ?? "staging";

  await sql.unsafe(
    `INSERT INTO sandboxes (id, name, status, health_status, capacity, instance_id, instance_type, environment, machine_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ec2')
     ON CONFLICT (id) DO NOTHING`,
    [id, name, status, healthStatus, capacity, instanceId, instanceType, environment],
  );

  return { id, name, status, healthStatus, capacity };
}

export interface TestUser {
  id: string;
  email: string;
}

export async function insertTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  const sql = getSql();
  const id = overrides.id ?? randomUUID();
  const email = overrides.email ?? testEmail(id.slice(0, 8));

  await sql.unsafe(
    `INSERT INTO users (id, email, name, role)
     VALUES ($1, $2, 'Test User', 'user')
     ON CONFLICT (id) DO NOTHING`,
    [id, email],
  );

  return { id, email };
}

export async function insertUserSandboxAssignment(
  userId: string,
  sandboxId: string,
): Promise<void> {
  const sql = getSql();
  await sql.unsafe(
    `INSERT INTO user_sandboxes (user_id, sandbox_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET sandbox_id = $2`,
    [userId, sandboxId],
  );
}

export async function insertTestTask(
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const sql = getSql();
  const id = (overrides.id as string) ?? randomUUID();
  const status = (overrides.status as string) ?? "created";
  const sandboxId = (overrides.sandboxId as string) ?? null;
  const jobUrl = (overrides.jobUrl as string) ?? "https://example.com/job";
  const workflowRunId = (overrides.workflowRunId as string) ?? null;
  const interactionType = (overrides.interactionType as string) ?? null;
  const interactionData = overrides.interactionData
    ? JSON.stringify(overrides.interactionData)
    : null;

  await sql.unsafe(
    `INSERT INTO tasks (id, user_id, job_url, status, sandbox_id, workflow_run_id, interaction_type, interaction_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [id, userId, jobUrl, status, sandboxId, workflowRunId, interactionType, interactionData],
  );

  return id;
}
