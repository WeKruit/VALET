/**
 * Integration tests for the sandbox admin module.
 *
 * Tests cover:
 *   - Admin middleware (role-based access control)
 *   - CRUD operations via SandboxService
 *   - Health check logic
 *   - Input validation
 *
 * These tests use vitest mocking to isolate the service layer from
 * the database. For full end-to-end tests against a running database,
 * see the Playwright E2E suite (when available).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import type { SandboxRepository } from "../sandbox.repository.js";
import type { TaskRepository } from "../../tasks/task.repository.js";
import type { GhostHandsClient } from "../../ghosthands/ghosthands.client.js";
import type { SandboxProviderFactory } from "../providers/provider-factory.js";
import type { SandboxAgentClient } from "../agent/sandbox-agent.client.js";
import type { SandboxRecord } from "../sandbox.repository.js";
import { SandboxService } from "../sandbox.service.js";
import { SandboxNotFoundError, SandboxDuplicateInstanceError } from "../sandbox.errors.js";

// ---------------------------------------------------------------------------
// Mocked repository
// ---------------------------------------------------------------------------

function makeMockRepo() {
  return {
    findById: vi.fn<(id: string) => Promise<SandboxRecord | null>>(),
    findByInstanceId: vi.fn<(instanceId: string) => Promise<SandboxRecord | null>>(),
    findMany:
      vi.fn<
        (query: Record<string, unknown>) => Promise<{ data: SandboxRecord[]; total: number }>
      >(),
    findAllActive: vi.fn<() => Promise<SandboxRecord[]>>(),
    create: vi.fn<(data: Record<string, unknown>) => Promise<SandboxRecord>>(),
    update: vi.fn<(id: string, data: Record<string, unknown>) => Promise<SandboxRecord | null>>(),
    updateHealthStatus: vi.fn<(id: string, status: string) => Promise<SandboxRecord | null>>(),
    terminate: vi.fn<(id: string) => Promise<SandboxRecord | null>>(),
  };
}

function makeMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "info",
    silent: vi.fn(),
  };
}

function makeMockTaskRepo() {
  return {
    findActiveBySandbox: vi.fn().mockResolvedValue([]),
    findRecentBySandbox: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(null),
  };
}

function makeMockGhosthandsClient() {
  return {
    cancelJob: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockProviderFactory() {
  return {
    getProvider: vi.fn().mockReturnValue({
      type: "ec2",
      startMachine: vi.fn().mockResolvedValue({ success: true, message: "started" }),
      stopMachine: vi.fn().mockResolvedValue({ success: true, message: "stopped" }),
      getMachineStatus: vi.fn().mockResolvedValue({ state: "running" }),
      getAgentUrl: vi.fn().mockReturnValue("http://34.197.248.80:8000"),
      pingAgent: vi.fn().mockResolvedValue(true),
    }),
    getByType: vi.fn(),
  };
}

function makeMockAgentClient() {
  return {
    getHealth: vi.fn().mockResolvedValue({ status: "ok" }),
    getVersion: vi.fn().mockResolvedValue({ agentVersion: "1.0.0" }),
    deploy: vi.fn().mockResolvedValue({ success: true }),
    getLogs: vi.fn().mockResolvedValue({ lines: [], service: "worker", truncated: false }),
    getEnvVars: vi.fn().mockResolvedValue({ vars: {}, redactedKeys: [] }),
    setEnvVars: vi.fn().mockResolvedValue(undefined),
    deleteEnvVar: vi.fn().mockResolvedValue(undefined),
    getContainers: vi.fn().mockResolvedValue([]),
    listWorkers: vi.fn().mockResolvedValue([]),
    startWorker: vi.fn().mockResolvedValue({ success: true }),
    stopWorker: vi.fn().mockResolvedValue({ success: true }),
    drainWorker: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn().mockResolvedValue({}),
    getMetrics: vi.fn().mockResolvedValue({}),
    getScreenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
    buildImage: vi.fn().mockResolvedValue({ success: true }),
    getTakeoverInfo: vi.fn().mockResolvedValue({}),
  };
}

const SANDBOX_FIXTURE: SandboxRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "staging-sandbox-1",
  environment: "staging",
  instanceId: "i-0123456789abcdef0",
  instanceType: "t3.medium",
  publicIp: "34.197.248.80",
  privateIp: "10.0.1.100",
  status: "active",
  healthStatus: "healthy",
  lastHealthCheckAt: new Date("2026-02-14T00:00:00Z"),
  capacity: 5,
  currentLoad: 0,
  sshKeyName: "valet-worker",
  novncUrl: "http://34.197.248.80:6080/vnc.html",
  adspowerVersion: "7.12.29",
  browserEngine: "adspower",
  browserConfig: null,
  tags: { team: "qa" },
  ec2Status: "running",
  lastStartedAt: null,
  lastStoppedAt: null,
  autoStopEnabled: false,
  idleMinutesBeforeStop: 60,
  machineType: "ec2",
  agentVersion: null,
  agentLastSeenAt: null,
  ghImageTag: null,
  ghImageUpdatedAt: null,
  deployedCommitSha: null,
  createdAt: new Date("2026-02-10T00:00:00Z"),
  updatedAt: new Date("2026-02-14T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SandboxService", () => {
  let service: SandboxService;
  let repo: ReturnType<typeof makeMockRepo>;
  let logger: ReturnType<typeof makeMockLogger>;
  let taskRepo: ReturnType<typeof makeMockTaskRepo>;
  let ghosthandsClient: ReturnType<typeof makeMockGhosthandsClient>;
  let agentClient: ReturnType<typeof makeMockAgentClient>;
  let providerFactory: ReturnType<typeof makeMockProviderFactory>;

  beforeEach(() => {
    repo = makeMockRepo();
    logger = makeMockLogger();
    taskRepo = makeMockTaskRepo();
    ghosthandsClient = makeMockGhosthandsClient();
    agentClient = makeMockAgentClient();
    providerFactory = makeMockProviderFactory();
    service = new SandboxService({
      sandboxRepo: repo as unknown as SandboxRepository,
      logger: logger as unknown as FastifyBaseLogger,
      taskRepo: taskRepo as unknown as TaskRepository,
      ghosthandsClient: ghosthandsClient as unknown as GhostHandsClient,
      sandboxProviderFactory: providerFactory as unknown as SandboxProviderFactory,
      sandboxAgentClient: agentClient as unknown as SandboxAgentClient,
    });
  });

  // ─── getById ───

  describe("getById", () => {
    it("returns sandbox when found", async () => {
      repo.findById.mockResolvedValue(SANDBOX_FIXTURE);

      const result = await service.getById(SANDBOX_FIXTURE.id);

      expect(result).toEqual(SANDBOX_FIXTURE);
      expect(repo.findById).toHaveBeenCalledWith(SANDBOX_FIXTURE.id);
    });

    it("throws SandboxNotFoundError when not found", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.getById("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
        SandboxNotFoundError,
      );
    });
  });

  // ─── list ───

  describe("list", () => {
    it("returns paginated results", async () => {
      repo.findMany.mockResolvedValue({
        data: [SANDBOX_FIXTURE],
        total: 1,
      });

      const result = await service.list({
        page: 1,
        pageSize: 20,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(20);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });

    it("calculates totalPages correctly", async () => {
      repo.findMany.mockResolvedValue({
        data: Array(20).fill(SANDBOX_FIXTURE),
        total: 45,
      });

      const result = await service.list({
        page: 1,
        pageSize: 20,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      expect(result.pagination.totalPages).toBe(3);
    });

    it("passes filters through to repository", async () => {
      repo.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.list({
        page: 1,
        pageSize: 20,
        environment: "staging",
        status: "active",
        healthStatus: "healthy",
        search: "test",
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(repo.findMany).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        environment: "staging",
        status: "active",
        healthStatus: "healthy",
        search: "test",
        sortBy: "name",
        sortOrder: "asc",
      });
    });
  });

  // ─── create ───

  describe("create", () => {
    const createBody = {
      name: "new-sandbox",
      environment: "staging" as const,
      instanceId: "i-new123",
      instanceType: "t3.large",
      publicIp: "1.2.3.4",
      capacity: 10,
      browserEngine: "adspower" as const,
    };

    it("creates sandbox when instanceId is unique", async () => {
      repo.findByInstanceId.mockResolvedValue(null);
      repo.create.mockResolvedValue({
        ...SANDBOX_FIXTURE,
        ...createBody,
        id: "22222222-2222-2222-2222-222222222222",
      });

      const result = await service.create(createBody);

      expect(result.name).toBe("new-sandbox");
      expect(repo.create).toHaveBeenCalledWith(createBody);
    });

    it("passes machineType through to repository (WEK-131)", async () => {
      const kasmBody = {
        ...createBody,
        instanceId: "kasm-123",
        machineType: "kasm" as const,
      };
      repo.findByInstanceId.mockResolvedValue(null);
      repo.create.mockResolvedValue({
        ...SANDBOX_FIXTURE,
        ...kasmBody,
        id: "33333333-3333-3333-3333-333333333333",
        machineType: "kasm",
      });

      const result = await service.create(kasmBody);

      expect(result.machineType).toBe("kasm");
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ machineType: "kasm" }));
    });

    it("throws SandboxDuplicateInstanceError for duplicate instanceId", async () => {
      repo.findByInstanceId.mockResolvedValue(SANDBOX_FIXTURE);

      await expect(
        service.create({
          ...createBody,
          instanceId: SANDBOX_FIXTURE.instanceId,
        }),
      ).rejects.toThrow(SandboxDuplicateInstanceError);
    });
  });

  // ─── update ───

  describe("update", () => {
    it("updates sandbox when found", async () => {
      repo.findById.mockResolvedValue(SANDBOX_FIXTURE);
      repo.update.mockResolvedValue({
        ...SANDBOX_FIXTURE,
        name: "updated-name",
      });

      const result = await service.update(SANDBOX_FIXTURE.id, {
        name: "updated-name",
      });

      expect(result.name).toBe("updated-name");
    });

    it("throws SandboxNotFoundError when sandbox does not exist", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.update("nonexistent-id", { name: "x" })).rejects.toThrow(
        SandboxNotFoundError,
      );
    });

    it("throws SandboxNotFoundError when update returns null", async () => {
      repo.findById.mockResolvedValue(SANDBOX_FIXTURE);
      repo.update.mockResolvedValue(null);

      await expect(service.update(SANDBOX_FIXTURE.id, { name: "x" })).rejects.toThrow(
        SandboxNotFoundError,
      );
    });
  });

  // ─── terminate ───

  describe("terminate", () => {
    it("terminates an existing sandbox", async () => {
      repo.findById.mockResolvedValue(SANDBOX_FIXTURE);
      repo.terminate.mockResolvedValue({
        ...SANDBOX_FIXTURE,
        status: "terminated",
      });

      await expect(service.terminate(SANDBOX_FIXTURE.id)).resolves.toBeUndefined();
    });

    it("throws SandboxNotFoundError when sandbox does not exist", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.terminate("nonexistent-id")).rejects.toThrow(SandboxNotFoundError);
    });
  });

  // ─── healthCheck ───

  describe("healthCheck", () => {
    it("returns unhealthy when provider has no agent URL", async () => {
      const noPubIp = { ...SANDBOX_FIXTURE, publicIp: null };
      repo.findById.mockResolvedValue(noPubIp);

      // Make provider throw when trying to get agent URL (no public IP)
      const mockProvider = providerFactory.getProvider();
      mockProvider.getAgentUrl.mockImplementation(() => {
        throw new Error("Sandbox has no public IP");
      });

      const result = await service.healthCheck(noPubIp.id);

      expect(result.healthStatus).toBe("unhealthy");
      expect(result.details).toEqual({ error: "No public IP configured" });
      expect(repo.updateHealthStatus).toHaveBeenCalledWith(noPubIp.id, "unhealthy");
    });

    it("throws SandboxNotFoundError when sandbox does not exist", async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.healthCheck("nonexistent-id")).rejects.toThrow(SandboxNotFoundError);
    });

    it("handles agent client failure gracefully", async () => {
      repo.findById.mockResolvedValue(SANDBOX_FIXTURE);
      repo.updateHealthStatus.mockResolvedValue(SANDBOX_FIXTURE);

      agentClient.getHealth.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await service.healthCheck(SANDBOX_FIXTURE.id);

      expect(result.healthStatus).toBe("unhealthy");
      expect(result.details).toEqual({ error: "ECONNREFUSED" });
    });

    it("returns healthy when worker responds ok", async () => {
      repo.findById.mockResolvedValue(SANDBOX_FIXTURE);
      repo.updateHealthStatus.mockResolvedValue(SANDBOX_FIXTURE);

      agentClient.getHealth.mockResolvedValue({
        status: "ok",
        adspowerStatus: "ok",
        activeWorkers: 1,
        deploySafe: true,
        apiHealthy: true,
        workerStatus: "running",
        currentDeploy: null,
        uptimeMs: 3600000,
      });

      const result = await service.healthCheck(SANDBOX_FIXTURE.id);

      expect(result.healthStatus).toBe("healthy");
      expect(repo.updateHealthStatus).toHaveBeenCalledWith(SANDBOX_FIXTURE.id, "healthy");
    });

    it("returns degraded when adspower is down", async () => {
      repo.findById.mockResolvedValue(SANDBOX_FIXTURE);
      repo.updateHealthStatus.mockResolvedValue(SANDBOX_FIXTURE);

      agentClient.getHealth.mockResolvedValue({
        status: "ok",
        adspowerStatus: "unreachable",
        activeWorkers: 1,
        deploySafe: true,
        apiHealthy: true,
        workerStatus: "running",
        currentDeploy: null,
        uptimeMs: 3600000,
      });

      const result = await service.healthCheck(SANDBOX_FIXTURE.id);
      expect(result.healthStatus).toBe("degraded");
    });
  });

  // ─── checkAllSandboxes ───

  describe("checkAllSandboxes", () => {
    it("returns results for all active sandboxes", async () => {
      const sandbox2 = {
        ...SANDBOX_FIXTURE,
        id: "22222222-2222-2222-2222-222222222222",
        name: "staging-sandbox-1",
        publicIp: null,
      };
      repo.findAllActive.mockResolvedValue([SANDBOX_FIXTURE, sandbox2]);
      repo.findById.mockResolvedValueOnce(SANDBOX_FIXTURE).mockResolvedValueOnce(sandbox2);
      repo.updateHealthStatus.mockResolvedValue(SANDBOX_FIXTURE);

      agentClient.getHealth.mockRejectedValue(new Error("timeout"));

      const results = await service.checkAllSandboxes();
      expect(results).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Admin middleware tests
// ---------------------------------------------------------------------------

describe("adminOnly middleware", () => {
  it("allows admin role", async () => {
    const { adminOnly } = await import("../../../common/middleware/admin.js");

    const request = { userRole: "admin" } as FastifyRequest;

    await expect(adminOnly(request)).resolves.toBeUndefined();
  });

  it("allows superadmin role", async () => {
    const { adminOnly } = await import("../../../common/middleware/admin.js");

    const request = { userRole: "superadmin" } as FastifyRequest;

    await expect(adminOnly(request)).resolves.toBeUndefined();
  });

  it("rejects regular user role", async () => {
    const { adminOnly } = await import("../../../common/middleware/admin.js");

    const request = { userRole: "user" } as FastifyRequest;

    await expect(adminOnly(request)).rejects.toThrow(/Admin access required/);
  });

  it("rejects undefined role", async () => {
    const { adminOnly } = await import("../../../common/middleware/admin.js");

    const request = { userRole: undefined } as unknown as FastifyRequest;

    await expect(adminOnly(request)).rejects.toThrow(/Admin access required/);
  });
});
