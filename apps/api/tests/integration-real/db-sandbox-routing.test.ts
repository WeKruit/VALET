/**
 * Real DB integration tests for sandbox routing.
 *
 * Tests UserSandboxRepository.findBestAvailableSandbox() and assignment
 * logic against real Postgres (Supabase).
 *
 * Gated: INTEGRATION_TEST=true + DATABASE_URL/DATABASE_DIRECT_URL set.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  isAvailable,
  getDb,
  getSql,
  closeDb,
  createTestScope,
  insertTestSandbox,
  insertTestUser,
  insertUserSandboxAssignment,
  testEmail,
} from "./_setup.js";

const SCOPE = "sr"; // sandbox-routing — unique per file
const { cleanup } = createTestScope(SCOPE);

// Scoped helpers that tag data with this file's prefix
const mkSandbox = (overrides: Record<string, unknown> = {}) =>
  insertTestSandbox(overrides as any, SCOPE);
const mkUser = () => insertTestUser({ email: testEmail(crypto.randomUUID().slice(0, 8), SCOPE) });

let UserSandboxRepository: any;

describe.runIf(isAvailable())("Real DB: Sandbox Routing", () => {
  beforeAll(async () => {
    const mod = await import("../../src/modules/sandboxes/user-sandbox.repository.js");
    UserSandboxRepository = mod.UserSandboxRepository;
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  function repo() {
    return new UserSandboxRepository({ db: getDb() });
  }

  // ── findBestAvailableSandbox ─────────────────────────────────────
  it("returns a sandbox when 3 active+healthy sandboxes exist with 0 assignments", async () => {
    const s1 = await mkSandbox({ capacity: 5 });
    const s2 = await mkSandbox({ capacity: 5 });
    const s3 = await mkSandbox({ capacity: 5 });

    const best = await repo().findBestAvailableSandbox();
    expect(best).not.toBeNull();
    expect([s1.id, s2.id, s3.id]).toContain(best);
  });

  it("returns sandbox with lowest load ratio when assignments vary", async () => {
    const s1 = await mkSandbox({ capacity: 5 });
    const s2 = await mkSandbox({ capacity: 5 });
    const s3 = await mkSandbox({ capacity: 5 });

    // s1 has 3 assignments, s2 has 1, s3 has 0
    for (let i = 0; i < 3; i++) {
      const u = await mkUser();
      await insertUserSandboxAssignment(u.id, s1.id);
    }
    const u4 = await mkUser();
    await insertUserSandboxAssignment(u4.id, s2.id);

    const best = await repo().findBestAvailableSandbox();
    expect(best).toBe(s3.id); // 0/5 is lowest
  });

  it("returns null when all sandboxes are at capacity", async () => {
    const s = await mkSandbox({ capacity: 2 });

    const u1 = await mkUser();
    const u2 = await mkUser();
    await insertUserSandboxAssignment(u1.id, s.id);
    await insertUserSandboxAssignment(u2.id, s.id);

    const best = await repo().findBestAvailableSandbox();
    expect(best).toBeNull();
  });

  it("only considers active+healthy sandboxes", async () => {
    await mkSandbox({ status: "stopped", healthStatus: "healthy", capacity: 5 });
    await mkSandbox({ status: "active", healthStatus: "unhealthy", capacity: 5 });
    await mkSandbox({ status: "terminated", healthStatus: "healthy", capacity: 5 });

    const best = await repo().findBestAvailableSandbox();
    expect(best).toBeNull(); // none qualify
  });

  it("returns active+healthy sandbox when mixed with disqualified ones", async () => {
    await mkSandbox({ status: "stopped", healthStatus: "healthy" });
    const good = await mkSandbox({ status: "active", healthStatus: "healthy", capacity: 5 });
    await mkSandbox({ status: "active", healthStatus: "degraded" });

    const best = await repo().findBestAvailableSandbox();
    expect(best).toBe(good.id);
  });

  // ── CRUD cycle ───────────────────────────────────────────────────
  it("assign → findByUserId → unassign round-trip", async () => {
    const s = await mkSandbox();
    const u = await mkUser();

    const assignment = await repo().assign(u.id, s.id);
    expect(assignment.userId).toBe(u.id);
    expect(assignment.sandboxId).toBe(s.id);

    const found = await repo().findByUserId(u.id);
    expect(found).not.toBeNull();
    expect(found!.sandboxId).toBe(s.id);

    const removed = await repo().unassign(u.id);
    expect(removed).toBe(true);

    const after = await repo().findByUserId(u.id);
    expect(after).toBeNull();
  });

  it("balanced distribution: 10 users across 3 sandboxes", async () => {
    const sandboxes = await Promise.all(
      Array.from({ length: 3 }, () => mkSandbox({ capacity: 10 })),
    );

    for (let i = 0; i < 10; i++) {
      const u = await mkUser();
      const best = await repo().findBestAvailableSandbox();
      expect(best).not.toBeNull();
      await repo().assign(u.id, best!);
    }

    for (const s of sandboxes) {
      const count = await repo().countBySandbox(s.id);
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  it("reassigns user when their sandbox becomes unhealthy", async () => {
    const s1 = await mkSandbox({ capacity: 5 });
    const s2 = await mkSandbox({ capacity: 5 });
    const u = await mkUser();

    await repo().assign(u.id, s1.id);

    const sql = getSql();
    await sql.unsafe(`UPDATE sandboxes SET health_status = 'unhealthy' WHERE id = $1`, [s1.id]);

    const best = await repo().findBestAvailableSandbox();
    expect(best).toBe(s2.id);

    await repo().assign(u.id, best!);
    const found = await repo().findByUserId(u.id);
    expect(found!.sandboxId).toBe(s2.id);
  });

  it("upsert constraint prevents duplicate user assignments", async () => {
    const s1 = await mkSandbox();
    const s2 = await mkSandbox();
    const u = await mkUser();

    await repo().assign(u.id, s1.id);
    await repo().assign(u.id, s2.id); // upsert: moves user to s2

    const found = await repo().findByUserId(u.id);
    expect(found!.sandboxId).toBe(s2.id);

    expect(await repo().countBySandbox(s1.id)).toBe(0);
    expect(await repo().countBySandbox(s2.id)).toBe(1);
  });

  it("COALESCE handles sandbox with 0 rows in user_sandboxes", async () => {
    const s = await mkSandbox({ capacity: 5 });
    const best = await repo().findBestAvailableSandbox();
    expect(best).toBe(s.id);
  });

  it("capacity=1 sandbox with 1 assignment is full, 0 assignments is available", async () => {
    const full = await mkSandbox({ capacity: 1 });
    const available = await mkSandbox({ capacity: 1 });

    const u = await mkUser();
    await insertUserSandboxAssignment(u.id, full.id);

    const best = await repo().findBestAvailableSandbox();
    expect(best).toBe(available.id);
  });

  it("large capacity (50) with 49 assignments is still available", async () => {
    const s = await mkSandbox({ capacity: 50 });

    // Batch-create users + assignments to stay under timeout
    for (let i = 0; i < 49; i++) {
      const u = await mkUser();
      await insertUserSandboxAssignment(u.id, s.id);
    }

    const best = await repo().findBestAvailableSandbox();
    expect(best).toBe(s.id);
  }, 30_000); // 30s timeout for 49 sequential inserts over network

  it("delete assignment decreases sandbox load", async () => {
    const s = await mkSandbox({ capacity: 5 });
    const u = await mkUser();

    await repo().assign(u.id, s.id);
    expect(await repo().countBySandbox(s.id)).toBe(1);

    await repo().unassign(u.id);
    expect(await repo().countBySandbox(s.id)).toBe(0);
  });
});
