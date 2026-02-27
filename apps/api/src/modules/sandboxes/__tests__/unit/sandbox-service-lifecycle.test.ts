import { describe, it, expect, vi } from "vitest";
import { SandboxService } from "../../sandbox.service.js";
import type { SandboxRecord, SandboxRepository } from "../../sandbox.repository.js";
import type { SandboxProviderFactory } from "../../providers/provider-factory.js";
import type {
  SandboxProvider,
  MachineLifecycleResult,
} from "../../providers/sandbox-provider.interface.js";
import type { DeepHealthChecker } from "../../deep-health-checker.js";

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
  ec2Status: "stopped",
  lastStartedAt: null,
  lastStoppedAt: null,
  autoStopEnabled: false,
  idleMinutesBeforeStop: 30,
  machineType: "ec2",
  agentVersion: null,
  agentLastSeenAt: null,
  ghImageTag: null,
  ghImageUpdatedAt: null,
  deployedCommitSha: null,
  healthCheckFailureCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeMockRepo() {
  return {
    findById: vi
      .fn<(id: string) => Promise<SandboxRecord | null>>()
      .mockResolvedValue(SANDBOX_FIXTURE),
    findByInstanceId: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: vi.fn().mockResolvedValue(SANDBOX_FIXTURE),
    update: vi.fn().mockResolvedValue(SANDBOX_FIXTURE),
    updateEc2Status: vi.fn().mockResolvedValue(undefined),
    updateHealthStatus: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn().mockResolvedValue(SANDBOX_FIXTURE),
    findAllActive: vi.fn().mockResolvedValue([]),
    findStaleActive: vi.fn().mockResolvedValue([]),
  } as unknown as SandboxRepository;
}

function makeMockProvider(overrides?: Partial<SandboxProvider>) {
  return {
    type: "ec2" as const,
    startMachine: vi.fn<(s: SandboxRecord) => Promise<MachineLifecycleResult>>().mockResolvedValue({
      success: true,
      message: "EC2 instance starting",
      newStatus: "pending",
    }),
    stopMachine: vi.fn<(s: SandboxRecord) => Promise<MachineLifecycleResult>>().mockResolvedValue({
      success: true,
      message: "EC2 instance stopping",
      newStatus: "stopping",
    }),
    getMachineStatus: vi
      .fn()
      .mockResolvedValue({ state: "running", publicIp: "34.197.248.80", privateIp: "10.0.1.100" }),
    getAgentUrl: vi.fn().mockReturnValue("http://34.197.248.80:8080"),
    pingAgent: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeMockProviderFactory(provider?: ReturnType<typeof makeMockProvider>) {
  const p = provider ?? makeMockProvider();
  return {
    getProvider: vi.fn().mockReturnValue(p),
    getByType: vi.fn().mockReturnValue(p),
  } as unknown as SandboxProviderFactory;
}

function createService(overrides?: {
  sandboxRepo?: SandboxRepository;
  providerFactory?: SandboxProviderFactory;
}) {
  const sandboxRepo = overrides?.sandboxRepo ?? makeMockRepo();
  const providerFactory = overrides?.providerFactory ?? makeMockProviderFactory();

  return new SandboxService({
    sandboxRepo,
    logger: MOCK_LOGGER,
    taskRepo: { findActiveBySandbox: vi.fn().mockResolvedValue([]) } as never,
    ghosthandsClient: { deregisterWorker: vi.fn(), cancelJob: vi.fn() } as never,
    sandboxProviderFactory: providerFactory,
    sandboxAgentClient: { getMetrics: vi.fn() } as never,
    deepHealthChecker: {
      check: vi.fn().mockResolvedValue({ overall: "healthy", checks: [], timestamp: Date.now() }),
    } as unknown as DeepHealthChecker,
    userSandboxRepo: { unassignBySandboxId: vi.fn().mockResolvedValue(0) } as never,
  });
}

describe("SandboxService lifecycle", () => {
  // ── startSandbox ────────────────────────────────────────────────────

  describe("startSandbox", () => {
    it("sets DB to pending when provider returns pending", async () => {
      const repo = makeMockRepo();
      const provider = makeMockProvider();
      const service = createService({
        sandboxRepo: repo,
        providerFactory: makeMockProviderFactory(provider),
      });

      await service.startSandbox(SANDBOX_FIXTURE.id);

      expect(provider.startMachine).toHaveBeenCalledWith(SANDBOX_FIXTURE);
      expect(repo.updateEc2Status).toHaveBeenCalledWith(
        SANDBOX_FIXTURE.id,
        "pending",
        expect.objectContaining({ lastStartedAt: expect.any(Date) }),
      );
    });

    it("sets DB to running when provider reports already_running", async () => {
      const repo = makeMockRepo();
      const provider = makeMockProvider({
        startMachine: vi.fn().mockResolvedValue({
          success: true,
          message: "EC2 instance already running",
          newStatus: "running",
          metadata: { atm_fleet_id: "gh-worker-1", hostname: "1.2.3.4" },
        }),
      });
      const service = createService({
        sandboxRepo: repo,
        providerFactory: makeMockProviderFactory(provider),
      });

      const result = await service.startSandbox(SANDBOX_FIXTURE.id);

      expect(result.ec2Status).toBe("running");
      expect(repo.updateEc2Status).toHaveBeenCalledWith(
        SANDBOX_FIXTURE.id,
        "running",
        expect.objectContaining({
          publicIp: "1.2.3.4",
          tags: expect.objectContaining({ atm_fleet_id: "gh-worker-1" }),
        }),
      );
    });

    it("stores atm_fleet_id in tags from metadata", async () => {
      const repo = makeMockRepo();
      const provider = makeMockProvider({
        startMachine: vi.fn().mockResolvedValue({
          success: true,
          message: "Starting",
          newStatus: "pending",
          metadata: { atm_fleet_id: "gh-worker-2" },
        }),
      });
      const service = createService({
        sandboxRepo: repo,
        providerFactory: makeMockProviderFactory(provider),
      });

      await service.startSandbox(SANDBOX_FIXTURE.id);

      expect(repo.updateEc2Status).toHaveBeenCalledWith(
        SANDBOX_FIXTURE.id,
        "pending",
        expect.objectContaining({
          tags: expect.objectContaining({ atm_fleet_id: "gh-worker-2" }),
        }),
      );
    });

    it("throws 409 when sandbox is already running", async () => {
      const repo = makeMockRepo();
      (repo.findById as any).mockResolvedValue({ ...SANDBOX_FIXTURE, ec2Status: "running" });
      const service = createService({ sandboxRepo: repo });

      await expect(service.startSandbox(SANDBOX_FIXTURE.id)).rejects.toThrow("already running");
    });

    it("throws 409 when sandbox is pending", async () => {
      const repo = makeMockRepo();
      (repo.findById as any).mockResolvedValue({ ...SANDBOX_FIXTURE, ec2Status: "pending" });
      const service = createService({ sandboxRepo: repo });

      await expect(service.startSandbox(SANDBOX_FIXTURE.id)).rejects.toThrow("already pending");
    });

    it("does not poll when status is already running", async () => {
      const provider = makeMockProvider({
        startMachine: vi.fn().mockResolvedValue({
          success: true,
          message: "Already running",
          newStatus: "running",
        }),
      });
      const service = createService({
        providerFactory: makeMockProviderFactory(provider),
      });

      await service.startSandbox(SANDBOX_FIXTURE.id);

      // getMachineStatus is used by poll — it should NOT be called if already running
      expect(provider.getMachineStatus).not.toHaveBeenCalled();
    });
  });

  // ── stopSandbox ─────────────────────────────────────────────────────

  describe("stopSandbox", () => {
    it("calls stopMachine and sets DB to stopping", async () => {
      const repo = makeMockRepo();
      (repo.findById as any).mockResolvedValue({ ...SANDBOX_FIXTURE, ec2Status: "running" });
      const provider = makeMockProvider();
      const service = createService({
        sandboxRepo: repo,
        providerFactory: makeMockProviderFactory(provider),
      });

      const result = await service.stopSandbox(SANDBOX_FIXTURE.id);

      expect(provider.stopMachine).toHaveBeenCalled();
      expect(repo.updateEc2Status).toHaveBeenCalledWith(
        SANDBOX_FIXTURE.id,
        "stopping",
        expect.objectContaining({ lastStoppedAt: expect.any(Date) }),
      );
      expect(result.ec2Status).toBe("stopping");
    });

    it("throws 409 when sandbox is already stopped", async () => {
      const repo = makeMockRepo();
      (repo.findById as any).mockResolvedValue({ ...SANDBOX_FIXTURE, ec2Status: "stopped" });
      const service = createService({ sandboxRepo: repo });

      await expect(service.stopSandbox(SANDBOX_FIXTURE.id)).rejects.toThrow("already stopped");
    });

    it("throws 409 when sandbox is already stopping", async () => {
      const repo = makeMockRepo();
      (repo.findById as any).mockResolvedValue({ ...SANDBOX_FIXTURE, ec2Status: "stopping" });
      const service = createService({ sandboxRepo: repo });

      await expect(service.stopSandbox(SANDBOX_FIXTURE.id)).rejects.toThrow("already stopping");
    });
  });
});
