import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  InstanceDiscoveryService,
  type AsgInstance,
  type DiscoveryDiff,
} from "../../instance-discovery.service.js";
import type { SandboxRecord } from "../../../sandboxes/sandbox.repository.js";

// ─── Private method accessor type for unit testing ───

interface PrivateMethods {
  computeDiff(asg: AsgInstance[], db: SandboxRecord[]): DiscoveryDiff;
  registerNewInstance(instance: AsgInstance): Promise<void>;
  deregisterStaleSandbox(sandbox: SandboxRecord): Promise<number>;
  recoverOrphanedJobs(sandbox: SandboxRecord): Promise<number>;
  updateSandboxIp(sandbox: SandboxRecord, instance: AsgInstance): Promise<void>;
  probeAndActivate(sandboxId: string): Promise<void>;
}

// ─── Mock Factories ───

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeSandboxRepo() {
  return {
    findActive: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findAsgManaged: vi.fn().mockResolvedValue([]),
    findByMachineTypeWithStatuses: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve({
        id: `sandbox-${Math.random().toString(36).slice(2, 8)}`,
        ...data,
        status: "active",
        healthStatus: "healthy",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    update: vi.fn().mockResolvedValue(null),
    resolveWorkerId: vi.fn().mockResolvedValue(null),
  };
}

function makeDeepHealthChecker() {
  return {
    check: vi.fn().mockResolvedValue({
      overall: "healthy" as const,
      checks: [{ name: "GH API", port: 3100, status: "up", responseTimeMs: 50 }],
      timestamp: Date.now(),
    }),
  };
}

function makeAuditLogService() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  };
}

function makeGhJobRepo() {
  return {
    updateStatus: vi.fn().mockResolvedValue(null),
  };
}

function makeTaskRepo() {
  return {
    updateStatus: vi.fn().mockResolvedValue(null),
  };
}

function makeDb() {
  return {
    execute: vi.fn().mockResolvedValue([]),
  };
}

function makeRedis() {
  return {
    publish: vi.fn().mockResolvedValue(1),
  };
}

function makeSandbox(overrides: Partial<SandboxRecord> = {}): SandboxRecord {
  return {
    id: `sandbox-${Math.random().toString(36).slice(2, 8)}`,
    name: "gh-worker-asg-1",
    environment: "staging",
    instanceId: "i-abc123",
    instanceType: "t3.large",
    publicIp: "10.0.0.1",
    privateIp: null,
    status: "active",
    healthStatus: "healthy",
    lastHealthCheckAt: new Date(),
    capacity: 1,
    currentLoad: 0,
    sshKeyName: "valet-worker.pem",
    novncUrl: null,
    adspowerVersion: null,
    browserEngine: "chromium",
    browserConfig: null,
    tags: { asg_managed: true, asg_name: "ghosthands-worker-asg" },
    ec2Status: "running",
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
    ...overrides,
  };
}

function makeMocks() {
  return {
    logger: makeLogger(),
    db: makeDb(),
    redis: makeRedis(),
    sandboxRepo: makeSandboxRepo(),
    deepHealthChecker: makeDeepHealthChecker(),
    auditLogService: makeAuditLogService(),
    ghJobRepo: makeGhJobRepo(),
    taskRepo: makeTaskRepo(),
  };
}

/** Cast service to access private methods for unit testing */
function priv(service: InstanceDiscoveryService): PrivateMethods {
  return service as unknown as PrivateMethods;
}

function makeAsgInstance(overrides: Partial<AsgInstance> = {}): AsgInstance {
  return {
    instanceId: "i-new123",
    publicIp: "10.0.0.5",
    instanceType: "t3.large",
    lifecycleState: "InService",
    healthStatus: "Healthy",
    ...overrides,
  };
}

// ─── Tests ───

describe("InstanceDiscoveryService", () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  describe("start()", () => {
    it("does nothing when AUTOSCALE_ASG_ENABLED is not true", () => {
      delete process.env.AUTOSCALE_ASG_ENABLED;
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      service.start();

      expect(mocks.logger.info).toHaveBeenCalledWith(expect.stringContaining("disabled"));

      service.stop();
    });

    it("does nothing when AWS_ASG_NAME is empty", () => {
      process.env.AUTOSCALE_ASG_ENABLED = "true";
      process.env.AWS_ASG_NAME = "";
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      service.start();

      expect(mocks.logger.info).toHaveBeenCalledWith(expect.stringContaining("disabled"));

      service.stop();
    });
  });

  describe("getDiff()", () => {
    it("returns empty diff when disabled", async () => {
      delete process.env.AUTOSCALE_ASG_ENABLED;
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      const diff = await service.getDiff();

      expect(diff.newInstances).toEqual([]);
      expect(diff.staleRecords).toEqual([]);
      expect(diff.matched).toEqual([]);
    });
  });

  describe("reconcile()", () => {
    it("returns empty result when disabled", async () => {
      delete process.env.AUTOSCALE_ASG_ENABLED;
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      const result = await service.reconcile();

      expect(result.registered).toBe(0);
      expect(result.deregistered).toBe(0);
      expect(result.ipUpdated).toBe(0);
      expect(result.orphanedJobsRecovered).toBe(0);
    });

    it("skips when already running", async () => {
      delete process.env.AUTOSCALE_ASG_ENABLED;
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      const result = await service.reconcile();

      expect(result.errors).toEqual([]);
    });
  });

  describe("computeDiff", () => {
    it("identifies new instances not in DB", () => {
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      const diff = priv(service).computeDiff([makeAsgInstance()], []);

      expect(diff.newInstances).toHaveLength(1);
      expect(diff.newInstances[0]?.instanceId).toBe("i-new123");
      expect(diff.staleRecords).toHaveLength(0);
      expect(diff.matched).toHaveLength(0);
    });

    it("identifies stale ASG-managed records not in ASG", () => {
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      const staleSandbox = makeSandbox({
        instanceId: "i-old456",
        tags: { asg_managed: true, asg_name: "ghosthands-worker-asg" },
      });

      const diff = priv(service).computeDiff([], [staleSandbox]);

      expect(diff.newInstances).toHaveLength(0);
      expect(diff.staleRecords).toHaveLength(1);
      expect(diff.staleRecords[0]?.id).toBe(staleSandbox.id);
    });

    it("does not mark non-ASG-managed sandboxes as stale", () => {
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      const manualSandbox = makeSandbox({
        instanceId: "i-manual",
        tags: null,
      });

      const diff = priv(service).computeDiff([], [manualSandbox]);

      expect(diff.staleRecords).toHaveLength(0);
    });

    it("detects IP changes on matched instances", () => {
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      const sandbox = makeSandbox({
        instanceId: "i-match789",
        publicIp: "10.0.0.1",
      });

      const diff = priv(service).computeDiff(
        [makeAsgInstance({ instanceId: "i-match789", publicIp: "10.0.0.99" })],
        [sandbox],
      );

      expect(diff.matched).toHaveLength(1);
      expect(diff.matched[0]?.ipChanged).toBe(true);
      expect(diff.newInstances).toHaveLength(0);
      expect(diff.staleRecords).toHaveLength(0);
    });

    it("reports no IP change when IPs match", () => {
      const mocks = makeMocks();
      const service = new InstanceDiscoveryService(mocks as never);

      const sandbox = makeSandbox({
        instanceId: "i-stable",
        publicIp: "10.0.0.1",
      });

      const diff = priv(service).computeDiff(
        [makeAsgInstance({ instanceId: "i-stable", publicIp: "10.0.0.1" })],
        [sandbox],
      );

      expect(diff.matched).toHaveLength(1);
      expect(diff.matched[0]?.ipChanged).toBe(false);
    });
  });

  describe("registerNewInstance", () => {
    it("creates a sandbox record with environment from env var", async () => {
      process.env.VALET_ENVIRONMENT = "prod";
      const mocks = makeMocks();
      mocks.sandboxRepo.findAsgManaged.mockResolvedValue([]);

      const service = new InstanceDiscoveryService(mocks as never);

      await priv(service).registerNewInstance(makeAsgInstance({ instanceType: "t3.xlarge" }));

      expect(mocks.sandboxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "gh-worker-asg-1",
          environment: "prod",
          instanceId: "i-new123",
          instanceType: "t3.xlarge",
          publicIp: "10.0.0.5",
          capacity: 1,
          sshKeyName: "valet-worker.pem",
          machineType: "ec2",
          tags: expect.objectContaining({
            asg_managed: true,
            registered_by: "instance_discovery",
          }),
        }),
      );

      expect(mocks.sandboxRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: "provisioning",
          ec2Status: "running",
          healthStatus: "degraded",
        }),
      );

      expect(mocks.auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "instance_discovered",
          result: "success",
        }),
      );
    });

    it("auto-increments sandbox name based on existing", async () => {
      const mocks = makeMocks();
      mocks.sandboxRepo.findAsgManaged.mockResolvedValue([
        makeSandbox({ name: "gh-worker-asg-1" }),
        makeSandbox({ name: "gh-worker-asg-3" }),
      ]);

      const service = new InstanceDiscoveryService(mocks as never);

      await priv(service).registerNewInstance(makeAsgInstance({ instanceId: "i-new456" }));

      expect(mocks.sandboxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "gh-worker-asg-4",
        }),
      );
    });
  });

  describe("deregisterStaleSandbox", () => {
    it("uses stopping as intermediate status then terminates", async () => {
      const mocks = makeMocks();
      mocks.sandboxRepo.resolveWorkerId.mockResolvedValue(null);

      const service = new InstanceDiscoveryService(mocks as never);

      const sandbox = makeSandbox({ id: "sb-stale" });
      await priv(service).deregisterStaleSandbox(sandbox);

      // First call: stopping (intermediate)
      expect(mocks.sandboxRepo.update).toHaveBeenCalledWith("sb-stale", {
        status: "stopping",
        ec2Status: "terminated",
        healthStatus: "unhealthy",
      });

      // Second call: terminated (final)
      expect(mocks.sandboxRepo.update).toHaveBeenCalledWith("sb-stale", {
        status: "terminated",
      });

      expect(mocks.auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: "sb-stale",
          action: "instance_deregistered",
          result: "success",
        }),
      );
    });
  });

  describe("recoverOrphanedJobs", () => {
    it("skips when no worker registered for sandbox", async () => {
      const mocks = makeMocks();
      mocks.sandboxRepo.resolveWorkerId.mockResolvedValue(null);

      const service = new InstanceDiscoveryService(mocks as never);

      const count = await priv(service).recoverOrphanedJobs(makeSandbox());

      expect(count).toBe(0);
      expect(mocks.ghJobRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("re-queues pending jobs and fails stale running jobs", async () => {
      const mocks = makeMocks();
      mocks.sandboxRepo.resolveWorkerId.mockResolvedValue("worker-123");

      // First call returns pending jobs, second returns running jobs, third is worker update
      mocks.db.execute
        .mockResolvedValueOnce([{ id: "job-pending-1", valet_task_id: "task-1" }])
        .mockResolvedValueOnce([
          { id: "job-running-1", valet_task_id: "task-2", user_id: "user-abc" },
        ])
        .mockResolvedValueOnce([]); // Worker registry update

      const service = new InstanceDiscoveryService(mocks as never);

      const count = await priv(service).recoverOrphanedJobs(makeSandbox());

      expect(count).toBe(2);

      // Pending job re-queued
      expect(mocks.ghJobRepo.updateStatus).toHaveBeenCalledWith(
        "job-pending-1",
        expect.objectContaining({
          status: "queued",
          workerId: null,
        }),
      );

      // Running job marked failed
      expect(mocks.ghJobRepo.updateStatus).toHaveBeenCalledWith(
        "job-running-1",
        expect.objectContaining({
          status: "failed",
          errorCode: "worker_terminated",
        }),
      );

      // VALET task also failed
      expect(mocks.taskRepo.updateStatus).toHaveBeenCalledWith("task-2", "failed");
    });

    it("publishes WebSocket notification when failing orphaned running jobs", async () => {
      const mocks = makeMocks();
      mocks.sandboxRepo.resolveWorkerId.mockResolvedValue("worker-123");

      mocks.db.execute
        .mockResolvedValueOnce([]) // No pending jobs
        .mockResolvedValueOnce([
          { id: "job-running-1", valet_task_id: "task-2", user_id: "user-abc" },
        ])
        .mockResolvedValueOnce([]); // Worker registry update

      const service = new InstanceDiscoveryService(mocks as never);

      await priv(service).recoverOrphanedJobs(makeSandbox());

      // Verify Redis publish was called for WebSocket notification
      expect(mocks.redis.publish).toHaveBeenCalledWith(
        "tasks:user-abc",
        expect.stringContaining('"type":"task_update"'),
      );

      // Parse the published message to verify structure
      const publishCall = mocks.redis.publish.mock.calls[0] as [string, string];
      const message = JSON.parse(publishCall[1]) as Record<string, unknown>;
      expect(message).toMatchObject({
        type: "task_update",
        taskId: "task-2",
        status: "failed",
        error: {
          code: "worker_terminated",
          message: expect.stringContaining("terminated"),
        },
      });
    });

    it("does not publish WebSocket when no user_id on task", async () => {
      const mocks = makeMocks();
      mocks.sandboxRepo.resolveWorkerId.mockResolvedValue("worker-123");

      mocks.db.execute
        .mockResolvedValueOnce([]) // No pending jobs
        .mockResolvedValueOnce([{ id: "job-running-1", valet_task_id: "task-2", user_id: null }])
        .mockResolvedValueOnce([]); // Worker registry update

      const service = new InstanceDiscoveryService(mocks as never);

      await priv(service).recoverOrphanedJobs(makeSandbox());

      // Task should still be failed
      expect(mocks.taskRepo.updateStatus).toHaveBeenCalledWith("task-2", "failed");

      // But no WebSocket publish (no user_id)
      expect(mocks.redis.publish).not.toHaveBeenCalled();
    });
  });

  describe("updateSandboxIp", () => {
    it("updates sandbox IP and worker registry", async () => {
      const mocks = makeMocks();

      const service = new InstanceDiscoveryService(mocks as never);

      const sandbox = makeSandbox({ id: "sb-1", publicIp: "10.0.0.1" });
      await priv(service).updateSandboxIp(
        sandbox,
        makeAsgInstance({ instanceId: "i-abc", publicIp: "10.0.0.99" }),
      );

      expect(mocks.sandboxRepo.update).toHaveBeenCalledWith("sb-1", {
        publicIp: "10.0.0.99",
        instanceId: "i-abc",
      });

      expect(mocks.db.execute).toHaveBeenCalled();

      expect(mocks.auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: "sb-1",
          action: "ip_updated",
        }),
      );
    });
  });

  describe("probeAndActivate", () => {
    it("activates sandbox when health check passes", async () => {
      const mocks = makeMocks();
      const sandbox = makeSandbox({ id: "sb-new", status: "provisioning" });
      mocks.sandboxRepo.findById.mockResolvedValue(sandbox);
      mocks.deepHealthChecker.check.mockResolvedValue({
        overall: "healthy",
        checks: [{ name: "GH API", port: 3100, status: "up", responseTimeMs: 50 }],
        timestamp: Date.now(),
      });

      const service = new InstanceDiscoveryService(mocks as never);

      await priv(service).probeAndActivate("sb-new");

      expect(mocks.sandboxRepo.update).toHaveBeenCalledWith("sb-new", {
        status: "active",
        healthStatus: "healthy",
        lastHealthCheckAt: expect.any(Date),
      });

      expect(mocks.auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: "sb-new",
          action: "instance_activated",
        }),
      );
    });

    it("leaves sandbox as provisioning when unhealthy", async () => {
      const mocks = makeMocks();
      const sandbox = makeSandbox({ id: "sb-new", status: "provisioning" });
      mocks.sandboxRepo.findById.mockResolvedValue(sandbox);
      mocks.deepHealthChecker.check.mockResolvedValue({
        overall: "unhealthy",
        checks: [{ name: "GH API", port: 3100, status: "down", responseTimeMs: 0 }],
        timestamp: Date.now(),
      });

      const service = new InstanceDiscoveryService(mocks as never);

      await priv(service).probeAndActivate("sb-new");

      expect(mocks.sandboxRepo.update).toHaveBeenCalledWith("sb-new", {
        healthStatus: "unhealthy",
        lastHealthCheckAt: expect.any(Date),
      });

      // Should NOT have been called with status: "active"
      expect(mocks.sandboxRepo.update).not.toHaveBeenCalledWith(
        "sb-new",
        expect.objectContaining({ status: "active" }),
      );
    });

    it("does nothing when sandbox not found", async () => {
      const mocks = makeMocks();
      mocks.sandboxRepo.findById.mockResolvedValue(null);

      const service = new InstanceDiscoveryService(mocks as never);

      await priv(service).probeAndActivate("sb-nonexistent");

      expect(mocks.deepHealthChecker.check).not.toHaveBeenCalled();
    });
  });

  describe("stop()", () => {
    it("clears pending health probe timeouts", async () => {
      const mocks = makeMocks();
      mocks.sandboxRepo.findAsgManaged.mockResolvedValue([]);

      const service = new InstanceDiscoveryService(mocks as never);

      // Register a new instance which schedules a health probe timeout
      await priv(service).registerNewInstance(makeAsgInstance());

      // Stop should clear the pending timeout
      service.stop();

      // Advance timers past the health probe delay — should NOT trigger the probe
      await vi.advanceTimersByTimeAsync(20_000);

      // findById should NOT have been called (the timeout was cleared)
      expect(mocks.sandboxRepo.findById).not.toHaveBeenCalled();
    });
  });
});
