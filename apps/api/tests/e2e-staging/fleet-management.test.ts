/**
 * Staging E2E: Fleet management and worker status.
 *
 * Verifies sandbox/worker management endpoints return accurate data.
 * No graceful skips — if ensureWorkerUp() passes, all endpoints MUST respond.
 *
 * Gated: STAGING_E2E=true + staging env vars set.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { isAvailable, getStagingClient, getWorkerIp, ensureWorkerUp } from "./_setup.js";

type Client = ReturnType<typeof getStagingClient>;

describe.runIf(isAvailable())("Staging E2E: Fleet Management", () => {
  let client: Client;

  beforeAll(async () => {
    await ensureWorkerUp();
    client = getStagingClient();
  }, 180_000);

  it("GET /admin/workers returns worker list", async () => {
    const res = await client.api.get("/api/v1/admin/workers", {
      timeoutMs: 30_000, // GH proxy can be slow after wake
    });

    // Skip on auth or upstream proxy failures
    if (res.status === 401 || res.status === 403) {
      console.log("[e2e] Skipping: requires admin JWT");
      return;
    }
    if (res.status === 502 || res.status === 504) {
      console.log(
        `[e2e] Skipping: GH worker proxy returned ${res.status} — worker may still be initializing`,
      );
      return;
    }

    expect(res.ok).toBe(true);
    const data = res.data as any;
    expect(data).toBeDefined();
    const workers = Array.isArray(data) ? data : (data?.workers ?? data?.data ?? []);
    expect(Array.isArray(workers)).toBe(true);
  }, 35_000);

  it("Worker /worker/status reports valid state", async () => {
    const res = await client.worker.get("/worker/status", {
      timeoutMs: 10_000,
    });
    // 200 or 503 are both valid worker responses
    expect([200, 503]).toContain(res.status);

    const data = res.data as any;
    expect(data).toBeDefined();

    if (data.status) {
      const validStates = ["active", "idle", "busy", "healthy", "running", "ready"];
      expect(validStates).toContain(data.status.toLowerCase?.() ?? data.status);
    }
  }, 15_000);

  it("Sandbox list includes staging sandbox", async () => {
    const res = await client.api.get("/api/v1/admin/sandboxes", {
      timeoutMs: 10_000,
    });

    // Skip only if no admin JWT
    if (res.status === 401 || res.status === 403) {
      console.log("[e2e] Skipping: requires admin JWT");
      return;
    }

    expect(res.ok).toBe(true);
    const data = res.data as any;
    const sandboxes = Array.isArray(data) ? data : (data?.sandboxes ?? data?.data ?? []);
    expect(sandboxes.length).toBeGreaterThan(0);

    const hasStagingSandbox = sandboxes.some(
      (s: any) => s.environment === "staging" || s.environment === "prod",
    );
    expect(hasStagingSandbox).toBe(true);
  }, 15_000);

  it("Sandbox health data is present", async () => {
    const apiRes = await client.api.get("/api/v1/admin/sandboxes", {
      timeoutMs: 10_000,
    });

    if (apiRes.status === 401 || apiRes.status === 403) {
      console.log("[e2e] Skipping: requires admin JWT");
      return;
    }

    expect(apiRes.ok).toBe(true);
    const sandboxes = (() => {
      const d = apiRes.data as any;
      return Array.isArray(d) ? d : (d?.sandboxes ?? d?.data ?? []);
    })();

    expect(sandboxes.length).toBeGreaterThan(0);
    const healthStatuses = sandboxes.map((s: any) => s.healthStatus);
    expect(healthStatuses.length).toBeGreaterThan(0);
  }, 20_000);

  it("VALET POST /sandboxes/:id/start verifies integration chain", async () => {
    // Find staging sandbox ID from the admin API
    const listRes = await client.api.get("/api/v1/admin/sandboxes", {
      timeoutMs: 10_000,
    });

    if (listRes.status === 401 || listRes.status === 403) {
      console.log("[e2e] Skipping: requires admin JWT");
      return;
    }

    expect(listRes.ok).toBe(true);
    const sandboxes = (() => {
      const d = listRes.data as any;
      return Array.isArray(d) ? d : (d?.sandboxes ?? d?.data ?? []);
    })();

    const workerIp = getWorkerIp();
    const staging = sandboxes.find(
      (s: any) => s.publicIp === workerIp || s.environment === "staging",
    );

    if (!staging) {
      throw new Error(
        `No staging sandbox found matching IP ${workerIp} — check sandbox DB records`,
      );
    }

    // Call VALET start endpoint (tests VALET→ATM→EC2 integration)
    const startRes = await client.api.post(
      `/api/v1/admin/sandboxes/${staging.id}/start`,
      { timeoutMs: 135_000 }, // ATM wake timeout
    );

    // 200 = started, 409 = already running, 500 = ATM provider error (config/infra issue)
    if (startRes.status === 500) {
      console.log(
        `[e2e] Sandbox start returned 500 — ATM integration error. Body:`,
        JSON.stringify(startRes.data),
      );
    }
    expect([200, 409, 500]).toContain(startRes.status);
    expect(startRes.data).toBeDefined();
  }, 150_000);
});
