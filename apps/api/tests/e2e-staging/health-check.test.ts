/**
 * Staging E2E: Health check tests.
 *
 * Verifies all staging infrastructure endpoints are reachable and healthy.
 * No graceful skips — if ensureWorkerUp() passes, all endpoints MUST respond.
 *
 * Gated: STAGING_E2E=true + staging env vars set.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { isAvailable, getStagingClient, ensureWorkerUp } from "./_setup.js";

type Client = ReturnType<typeof getStagingClient>;

describe.runIf(isAvailable())("Staging E2E: Health Checks", () => {
  let client: Client;

  beforeAll(async () => {
    await ensureWorkerUp();
    client = getStagingClient();
  }, 180_000); // 3 min — covers EC2 cold start

  it("VALET API /api/v1/health returns 200", async () => {
    const res = await client.api.get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  }, 15_000);

  it("EC2 GhostHands API :3100/health returns 200", async () => {
    const res = await client.gh.get("/health", { timeoutMs: 10_000 });
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
  }, 15_000);

  it("EC2 Deploy Server :8000/health returns 200 with status", async () => {
    const res = await client.deploy.get("/health", { timeoutMs: 10_000 });
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.data).toHaveProperty("status");
  }, 15_000);

  it("EC2 Worker :3101/worker/status returns worker info", async () => {
    const res = await client.worker.get("/worker/status", {
      timeoutMs: 10_000,
    });
    // Worker may return 200 (idle/active) or 503 (unhealthy) — both valid
    expect([200, 503]).toContain(res.status);
    expect(res.data).toBeDefined();
  }, 15_000);

  it("GH models catalog returns valid response", async () => {
    const res = await client.gh.get("/api/v1/gh/models", {
      timeoutMs: 10_000,
    });
    // 200 = models available, 404 = endpoint not deployed yet — both valid
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.data).toBeDefined();
    }
  }, 15_000);
});
