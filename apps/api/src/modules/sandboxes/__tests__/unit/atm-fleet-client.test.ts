import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AtmFleetClient, AtmError } from "../../atm-fleet.client.js";
import type { SandboxRecord } from "../../sandbox.repository.js";

const MOCK_LOGGER = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
} as never;

const SANDBOX_FIXTURE: SandboxRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "test-sandbox",
  environment: "staging",
  instanceId: "i-0123456789abcdef0",
  instanceType: "t3.medium",
  publicIp: "34.197.248.80",
  privateIp: "10.0.1.100",
  status: "active",
  healthStatus: "healthy",
  lastHealthCheckAt: new Date(),
  capacity: 5,
  currentLoad: 0,
  sshKeyName: null,
  novncUrl: null,
  adspowerVersion: null,
  browserEngine: "adspower",
  browserConfig: null,
  tags: null,
  ec2Status: "running",
  lastStartedAt: null,
  lastStoppedAt: null,
  autoStopEnabled: false,
  autoStopOwner: "none",
  idleMinutesBeforeStop: 30,
  machineType: "ec2",
  agentVersion: null,
  agentLastSeenAt: null,
  ghImageTag: null,
  ghImageUpdatedAt: null,
  deployedCommitSha: null,
  healthCheckFailureCount: 0,
  lastBecameIdleAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(text: string, status: number) {
  return new Response(text, { status });
}

describe("AtmFleetClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.ATM_BASE_URL = "https://atm-gw1.wekruit.com";
    process.env.ATM_DEPLOY_SECRET = "test-secret-123";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ATM_BASE_URL;
    delete process.env.ATM_DEPLOY_SECRET;
  });

  function createClient() {
    return new AtmFleetClient({ logger: MOCK_LOGGER });
  }

  // ── isConfigured ────────────────────────────────────────────────────

  describe("isConfigured", () => {
    it("returns true when ATM_BASE_URL is set", () => {
      expect(createClient().isConfigured).toBe(true);
    });

    it("returns false when ATM_BASE_URL is empty string", () => {
      process.env.ATM_BASE_URL = "";
      expect(createClient().isConfigured).toBe(false);
    });

    it("returns false when ATM_BASE_URL is unset", () => {
      delete process.env.ATM_BASE_URL;
      expect(createClient().isConfigured).toBe(false);
    });
  });

  // ── resolveFleetId ──────────────────────────────────────────────────

  describe("resolveFleetId", () => {
    it("returns tag value immediately without fetching", async () => {
      const sandbox = {
        ...SANDBOX_FIXTURE,
        tags: { atm_fleet_id: "gh-worker-1" },
      };
      const client = createClient();
      const result = await client.resolveFleetId(sandbox);

      expect(result).toBe("gh-worker-1");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns cached fleet ID on second call", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          enabled: true,
          workers: [
            {
              serverId: "gh-worker-1",
              ip: "1.2.3.4",
              instanceId: "i-0123456789abcdef0",
              ec2State: "running",
              activeJobs: 0,
              idleSinceMs: 0,
              transitioning: false,
            },
          ],
        }),
      );
      const client = createClient();

      const first = await client.resolveFleetId(SANDBOX_FIXTURE);
      expect(first).toBe("gh-worker-1");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const second = await client.resolveFleetId(SANDBOX_FIXTURE);
      expect(second).toBe("gh-worker-1");
      // No additional fetch because idle-status was cached
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("matches by instanceId", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          enabled: true,
          workers: [
            {
              serverId: "gh-worker-2",
              ip: "5.6.7.8",
              instanceId: "i-0123456789abcdef0",
              ec2State: "running",
              activeJobs: 0,
              idleSinceMs: 0,
              transitioning: false,
            },
          ],
        }),
      );
      const client = createClient();
      const result = await client.resolveFleetId(SANDBOX_FIXTURE);
      expect(result).toBe("gh-worker-2");
    });

    it("falls back to IP matching when instanceId does not match", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          enabled: true,
          workers: [
            {
              serverId: "gh-worker-3",
              ip: "34.197.248.80",
              instanceId: "i-other",
              ec2State: "running",
              activeJobs: 0,
              idleSinceMs: 0,
              transitioning: false,
            },
          ],
        }),
      );
      const client = createClient();
      const result = await client.resolveFleetId(SANDBOX_FIXTURE);
      expect(result).toBe("gh-worker-3");
    });

    it("returns null when ATM is unreachable", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
      const client = createClient();
      const result = await client.resolveFleetId(SANDBOX_FIXTURE);
      expect(result).toBeNull();
    });

    it("returns null when no worker matches", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          enabled: true,
          workers: [
            {
              serverId: "gh-worker-99",
              ip: "9.9.9.9",
              instanceId: "i-nomatch",
              ec2State: "running",
              activeJobs: 0,
              idleSinceMs: 0,
              transitioning: false,
            },
          ],
        }),
      );
      const client = createClient();
      const result = await client.resolveFleetId(SANDBOX_FIXTURE);
      expect(result).toBeNull();
    });

    it("returns null when not configured", async () => {
      delete process.env.ATM_BASE_URL;
      const client = createClient();
      const result = await client.resolveFleetId(SANDBOX_FIXTURE);
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ── resolveFleetIdSync ──────────────────────────────────────────────

  describe("resolveFleetIdSync", () => {
    it("returns fleet ID from tags", () => {
      const sandbox = { ...SANDBOX_FIXTURE, tags: { atm_fleet_id: "gh-worker-1" } };
      const client = createClient();
      expect(client.resolveFleetIdSync(sandbox)).toBe("gh-worker-1");
    });

    it("returns null when tags is null", () => {
      const client = createClient();
      expect(client.resolveFleetIdSync(SANDBOX_FIXTURE)).toBeNull();
    });

    it("returns null when tags has no atm_fleet_id key", () => {
      const sandbox = { ...SANDBOX_FIXTURE, tags: { other: "val" } };
      const client = createClient();
      expect(client.resolveFleetIdSync(sandbox)).toBeNull();
    });
  });

  // ── wakeWorker ──────────────────────────────────────────────────────

  describe("wakeWorker", () => {
    it("sends POST with auth header and returns result", async () => {
      const payload = {
        status: "started",
        serverId: "gh-worker-1",
        instanceId: "i-abc",
        ip: "1.2.3.4",
      };
      fetchMock.mockResolvedValue(jsonResponse(payload));

      const client = createClient();
      const result = await client.wakeWorker("gh-worker-1");

      expect(result).toEqual(payload);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://atm-gw1.wekruit.com/fleet/gh-worker-1/wake",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Deploy-Secret": "test-secret-123",
          }),
        }),
      );
    });

    it("returns already_running result", async () => {
      const payload = {
        status: "already_running",
        serverId: "gh-worker-1",
        instanceId: "i-abc",
        ip: "1.2.3.4",
      };
      fetchMock.mockResolvedValue(jsonResponse(payload));

      const client = createClient();
      const result = await client.wakeWorker("gh-worker-1");
      expect(result.status).toBe("already_running");
    });

    it("throws AtmError on 409", async () => {
      fetchMock.mockResolvedValue(textResponse('{"error":"Worker busy"}', 409));

      const client = createClient();
      const err = (await client.wakeWorker("gh-worker-1").catch((e: unknown) => e)) as AtmError;
      expect(err).toBeInstanceOf(AtmError);
      expect(err.message).toContain("Worker busy");
      expect(err.statusCode).toBe(409);
    });
  });

  // ── stopWorker ──────────────────────────────────────────────────────

  describe("stopWorker", () => {
    it("sends POST with auth header and returns result", async () => {
      const payload = { status: "stopping", serverId: "gh-worker-1", instanceId: "i-abc" };
      fetchMock.mockResolvedValue(jsonResponse(payload));

      const client = createClient();
      const result = await client.stopWorker("gh-worker-1");

      expect(result).toEqual(payload);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://atm-gw1.wekruit.com/fleet/gh-worker-1/stop",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Deploy-Secret": "test-secret-123",
          }),
        }),
      );
    });

    it("throws AtmError on 409", async () => {
      fetchMock.mockResolvedValue(textResponse('{"error":"Active jobs"}', 409));

      const client = createClient();
      await expect(client.stopWorker("gh-worker-1")).rejects.toThrow(AtmError);
    });
  });

  // ── getWorkerHealth ─────────────────────────────────────────────────

  describe("getWorkerHealth", () => {
    it("returns health result via GET", async () => {
      const payload = {
        status: "healthy",
        activeWorkers: 1,
        deploySafe: true,
        apiHealthy: true,
        workerStatus: "idle",
        uptimeMs: 60000,
      };
      fetchMock.mockResolvedValue(jsonResponse(payload));

      const client = createClient();
      const result = await client.getWorkerHealth("gh-worker-1");

      expect(result).toEqual(payload);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://atm-gw1.wekruit.com/fleet/gh-worker-1/health",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("throws AtmError on 500", async () => {
      fetchMock.mockResolvedValue(textResponse("Internal Server Error", 500));

      const client = createClient();
      await expect(client.getWorkerHealth("gh-worker-1")).rejects.toThrow(AtmError);
    });
  });

  // ── getIdleStatus ───────────────────────────────────────────────────

  describe("getIdleStatus", () => {
    it("fetches on first call", async () => {
      const payload = { enabled: true, workers: [] };
      fetchMock.mockResolvedValue(jsonResponse(payload));

      const client = createClient();
      const result = await client.getIdleStatus();

      expect(result).toEqual(payload);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns cached result on second call", async () => {
      const payload = { enabled: true, workers: [] };
      fetchMock.mockResolvedValue(jsonResponse(payload));

      const client = createClient();
      await client.getIdleStatus();
      await client.getIdleStatus();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("re-fetches after cache TTL expires", async () => {
      vi.useFakeTimers();
      const payload = { enabled: true, workers: [] };
      // Return a fresh Response for each call (Response body can only be read once)
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(payload)));

      const client = createClient();
      await client.getIdleStatus();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Advance past 1-minute TTL
      vi.advanceTimersByTime(61_000);
      await client.getIdleStatus();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  // ── getWorkerState ──────────────────────────────────────────────────

  describe("getWorkerState", () => {
    it("finds worker by serverId", async () => {
      const worker = {
        serverId: "gh-worker-1",
        ip: "1.2.3.4",
        instanceId: "i-abc",
        ec2State: "running",
        activeJobs: 0,
        idleSinceMs: 0,
        transitioning: false,
      };
      fetchMock.mockResolvedValue(jsonResponse({ enabled: true, workers: [worker] }));

      const client = createClient();
      const result = await client.getWorkerState("gh-worker-1");
      expect(result).toEqual(worker);
    });

    it("returns null when worker not found", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ enabled: true, workers: [] }));

      const client = createClient();
      const result = await client.getWorkerState("gh-worker-99");
      expect(result).toBeNull();
    });
  });

  // ── AtmError ────────────────────────────────────────────────────────

  describe("AtmError", () => {
    it("parses JSON error field", () => {
      const err = new AtmError(409, '{"error":"Worker busy"}');
      expect(err.message).toBe("ATM 409: Worker busy");
      expect(err.statusCode).toBe(409);
      expect(err.responseBody).toBe('{"error":"Worker busy"}');
    });

    it("parses JSON message field", () => {
      const err = new AtmError(400, '{"message":"Bad request"}');
      expect(err.message).toBe("ATM 400: Bad request");
    });

    it("falls back to plain text", () => {
      const err = new AtmError(500, "Internal Server Error");
      expect(err.message).toBe("ATM 500: Internal Server Error");
    });

    it("exposes statusCode and responseBody", () => {
      const err = new AtmError(503, "Service Unavailable");
      expect(err.statusCode).toBe(503);
      expect(err.responseBody).toBe("Service Unavailable");
      expect(err.name).toBe("AtmError");
    });
  });
});
