import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeepHealthChecker } from "../../deep-health-checker.js";
import type { AtmFleetClient, AtmHealthResult } from "../../atm-fleet.client.js";
import type { SandboxProviderFactory } from "../../providers/provider-factory.js";
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

function makeMockAtmFleetClient(configured: boolean) {
  return {
    isConfigured: configured,
    resolveFleetId: vi.fn().mockResolvedValue("gh-worker-1"),
    resolveFleetIdSync: vi.fn().mockReturnValue("gh-worker-1"),
    getIdleStatus: vi.fn().mockResolvedValue({ enabled: true, workers: [] }),
    wakeWorker: vi.fn(),
    stopWorker: vi.fn(),
    getWorkerHealth: vi.fn<() => Promise<AtmHealthResult>>().mockResolvedValue({
      status: "healthy",
      activeWorkers: 1,
      deploySafe: true,
      apiHealthy: true,
      workerStatus: "idle",
      uptimeMs: 60000,
    }),
    getWorkerState: vi.fn(),
  } as unknown as AtmFleetClient;
}

function makeMockProviderFactory() {
  return {
    getProvider: vi.fn(),
    getByType: vi.fn(),
  } as unknown as SandboxProviderFactory;
}

describe("DeepHealthChecker", () => {
  let atmFleetClient: ReturnType<typeof makeMockAtmFleetClient>;
  let providerFactory: SandboxProviderFactory;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    atmFleetClient = makeMockAtmFleetClient(true);
    providerFactory = makeMockProviderFactory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createChecker(atm: AtmFleetClient | null = atmFleetClient as unknown as AtmFleetClient) {
    return new DeepHealthChecker({
      logger: MOCK_LOGGER,
      sandboxProviderFactory: providerFactory,
      atmFleetClient: atm,
    });
  }

  // ── checkEc2 (ATM path) ────────────────────────────────────────────

  /** Extract check by index with runtime guard (satisfies noUncheckedIndexedAccess). */
  function checkAt(
    checks: { name: string; status: string; details?: Record<string, unknown> }[],
    i: number,
  ) {
    const c = checks[i];
    if (!c) throw new Error(`Expected check at index ${i}, got ${checks.length} checks`);
    return c;
  }

  describe("checkEc2 (ATM path)", () => {
    it("delegates to getWorkerHealth and returns healthy result", async () => {
      const checker = createChecker();
      const result = await checker.check(SANDBOX_FIXTURE);

      expect((atmFleetClient as any).resolveFleetId).toHaveBeenCalledWith(SANDBOX_FIXTURE);
      expect((atmFleetClient as any).getWorkerHealth).toHaveBeenCalledWith("gh-worker-1");
      expect(result.overall).toBe("healthy");
      expect(result.checks).toHaveLength(2);

      const apiCheck = checkAt(result.checks, 0);
      const workerCheck = checkAt(result.checks, 1);
      expect(apiCheck.name).toBe("GH API");
      expect(apiCheck.status).toBe("up");
      expect(workerCheck.name).toBe("GH Worker");
      expect(workerCheck.status).toBe("up");
    });

    it("maps degraded ATM status to degraded result", async () => {
      (atmFleetClient as any).getWorkerHealth.mockResolvedValue({
        status: "degraded",
        activeWorkers: 0,
        deploySafe: true,
        apiHealthy: true,
        workerStatus: "unreachable",
        uptimeMs: 30000,
      });

      const checker = createChecker();
      const result = await checker.check(SANDBOX_FIXTURE);

      expect(result.overall).toBe("degraded");
      expect(checkAt(result.checks, 1).status).toBe("down"); // workerStatus = unreachable
    });

    it("maps offline ATM status to unhealthy result", async () => {
      (atmFleetClient as any).getWorkerHealth.mockResolvedValue({
        status: "offline",
        activeWorkers: 0,
        deploySafe: false,
        apiHealthy: false,
        workerStatus: "unreachable",
        uptimeMs: 0,
      });

      const checker = createChecker();
      const result = await checker.check(SANDBOX_FIXTURE);

      expect(result.overall).toBe("unhealthy");
      expect(checkAt(result.checks, 0).status).toBe("down"); // apiHealthy = false
      expect(checkAt(result.checks, 1).status).toBe("down"); // workerStatus = unreachable
    });

    it("maps workerStatus=unreachable to GH Worker down", async () => {
      (atmFleetClient as any).getWorkerHealth.mockResolvedValue({
        status: "healthy",
        activeWorkers: 1,
        deploySafe: true,
        apiHealthy: true,
        workerStatus: "unreachable",
        uptimeMs: 60000,
      });

      const checker = createChecker();
      const result = await checker.check(SANDBOX_FIXTURE);

      expect(checkAt(result.checks, 1).status).toBe("down");
    });

    it("maps workerStatus=idle to GH Worker up", async () => {
      const checker = createChecker();
      const result = await checker.check(SANDBOX_FIXTURE);

      const workerCheck = checkAt(result.checks, 1);
      expect(workerCheck.status).toBe("up");
      expect(workerCheck.details).toEqual(expect.objectContaining({ workerStatus: "idle" }));
    });

    it("includes ATM metadata in check details", async () => {
      const checker = createChecker();
      const result = await checker.check(SANDBOX_FIXTURE);

      const apiCheck = checkAt(result.checks, 0);
      const workerCheck = checkAt(result.checks, 1);
      expect(apiCheck.details).toEqual(
        expect.objectContaining({ source: "atm-fleet-proxy", apiHealthy: true }),
      );
      expect(workerCheck.details).toEqual(
        expect.objectContaining({
          source: "atm-fleet-proxy",
          activeWorkers: 1,
          deploySafe: true,
        }),
      );
    });
  });

  // ── checkEc2 (fallback) ────────────────────────────────────────────

  describe("checkEc2 (fallback)", () => {
    it("falls back to direct probing when ATM throws", async () => {
      (atmFleetClient as any).getWorkerHealth.mockRejectedValue(new Error("ATM unreachable"));

      // Mock direct port probing responses
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));

      const checker = createChecker();
      const result = await checker.check(SANDBOX_FIXTURE);

      // Should have probed ports directly
      expect(fetchMock).toHaveBeenCalled();
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it("falls back to direct probing when fleet ID is null", async () => {
      (atmFleetClient as any).resolveFleetId.mockResolvedValue(null);
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));

      const checker = createChecker();
      const result = await checker.check(SANDBOX_FIXTURE);

      expect((atmFleetClient as any).getWorkerHealth).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalled();
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it("falls back to direct probing when ATM not configured", async () => {
      const unconfigured = makeMockAtmFleetClient(false);
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));

      const checker = createChecker(unconfigured as unknown as AtmFleetClient);
      const result = await checker.check(SANDBOX_FIXTURE);

      expect((unconfigured as any).resolveFleetId).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalled();
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it("returns unhealthy when no IP and no ATM", async () => {
      const noIpSandbox = { ...SANDBOX_FIXTURE, publicIp: null };
      const unconfigured = makeMockAtmFleetClient(false);

      const checker = createChecker(unconfigured as unknown as AtmFleetClient);
      const result = await checker.check(noIpSandbox);

      expect(result.overall).toBe("unhealthy");
      expect(result.checks.every((c) => c.status === "down")).toBe(true);
    });
  });

  // ── checkKasm ───────────────────────────────────────────────────────

  describe("checkKasm", () => {
    it("does NOT use ATM fleet client for Kasm sandboxes", async () => {
      const kasmSandbox = { ...SANDBOX_FIXTURE, machineType: "kasm" as const };

      const checker = createChecker();
      // Will fail without kasmClient, but we're checking it doesn't touch ATM
      await checker.check(kasmSandbox).catch(() => {});

      expect((atmFleetClient as any).resolveFleetId).not.toHaveBeenCalled();
      expect((atmFleetClient as any).getWorkerHealth).not.toHaveBeenCalled();
    });
  });
});
