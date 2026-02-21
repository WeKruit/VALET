import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoScaleService } from "../auto-scale.service.js";
import type { TaskQueueService, QueueStats } from "../../modules/tasks/task-queue.service.js";
import type { Database } from "@valet/db";
import type { FastifyBaseLogger } from "fastify";

// Mock AWS SDK — we don't want real AWS calls in tests
const mockAsgSend = vi.fn();
const mockEc2Send = vi.fn();

vi.mock("@aws-sdk/client-auto-scaling", () => ({
  AutoScalingClient: vi.fn().mockImplementation(() => ({ send: mockAsgSend })),
  DescribeAutoScalingGroupsCommand: vi.fn().mockImplementation((input) => ({
    _type: "DescribeAutoScalingGroups",
    ...input,
  })),
  UpdateAutoScalingGroupCommand: vi.fn().mockImplementation((input) => ({
    _type: "UpdateAutoScalingGroup",
    ...input,
  })),
}));

vi.mock("@aws-sdk/client-ec2", () => ({
  EC2Client: vi.fn().mockImplementation(() => ({ send: mockEc2Send })),
  DescribeInstancesCommand: vi.fn().mockImplementation((input) => ({
    _type: "DescribeInstances",
    ...input,
  })),
}));

function makeLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    silent: vi.fn(),
    level: "info",
  } as unknown as FastifyBaseLogger;
}

function makeTaskQueueService(stats: QueueStats | null = null): TaskQueueService {
  return {
    getQueueStats: vi.fn().mockResolvedValue(stats),
    isAvailable: true,
  } as unknown as TaskQueueService;
}

function makeDb(
  statusRows: Array<{ status: string; count: string }> = [],
  idleCount = "0",
): Database {
  const execute = vi.fn();
  // First call: status group by
  execute.mockResolvedValueOnce(statusRows);
  // Second call: idle count
  execute.mockResolvedValueOnce([{ count: idleCount }]);
  return { execute } as unknown as Database;
}

describe("AutoScaleService", () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  function setEnv(overrides: Record<string, string> = {}) {
    process.env.AUTOSCALE_ASG_ENABLED = "true";
    process.env.AWS_ASG_NAME = "gh-worker-asg";
    process.env.AUTOSCALE_ASG_MIN = "1";
    process.env.AUTOSCALE_ASG_MAX = "10";
    // NOTE: Production default is 1 (matching GH MAX_CONCURRENT_JOBS).
    // Tests use 3 to verify the scaling formula with a non-trivial divisor.
    process.env.JOBS_PER_WORKER = "3";
    process.env.AWS_REGION = "us-east-1";
    Object.assign(process.env, overrides);
  }

  // Use the module-level mock send functions directly.
  // Both AutoScalingClient and EC2Client .send() are captured via the mocked constructors above.
  function getAsgClientSend(_service: AutoScaleService): ReturnType<typeof vi.fn> {
    return mockAsgSend;
  }

  describe("evaluate() — queue=10, workers=2, jobsPerWorker=3 => desired=4", () => {
    it("calls UpdateAutoScalingGroup with desired=4", async () => {
      setEnv({ JOBS_PER_WORKER: "3" });

      const db = makeDb([{ status: "active", count: "2" }], "0");
      const tqs = makeTaskQueueService({ queued: 10, active: 0, completed: 0, failed: 0, all: 10 });
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });
      const send = getAsgClientSend(service);

      // DescribeAutoScalingGroups returns current=2
      send.mockResolvedValueOnce({
        AutoScalingGroups: [{ DesiredCapacity: 2, MinSize: 1, MaxSize: 10 }],
      });
      // UpdateAutoScalingGroup succeeds
      send.mockResolvedValueOnce({});

      await service.evaluate();

      // ceil(10 / 3) = 4, clamped [1, 10] = 4
      expect(send).toHaveBeenCalledTimes(2);
      // Second call should be UpdateAutoScalingGroup with desired=4
      const updateCall = send.mock.calls[1]?.[0];
      expect(updateCall).toMatchObject({
        DesiredCapacity: 4,
        MinSize: 1,
        MaxSize: 10,
        AutoScalingGroupName: "gh-worker-asg",
      });
    });
  });

  describe("evaluate() — queue=0, workers=3 => desired=min(1)", () => {
    it("scales down to minCapacity", async () => {
      setEnv({ JOBS_PER_WORKER: "3" });

      const db = makeDb([{ status: "active", count: "3" }], "3");
      const tqs = makeTaskQueueService({ queued: 0, active: 0, completed: 0, failed: 0, all: 0 });
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });
      const send = getAsgClientSend(service);

      // DescribeAutoScalingGroups returns current=3
      send.mockResolvedValueOnce({
        AutoScalingGroups: [{ DesiredCapacity: 3 }],
      });
      send.mockResolvedValueOnce({});

      await service.evaluate();

      // ceil(0 / 3) = 0, clamped [1, 10] = 1. Current=3 !== 1, so update.
      expect(send).toHaveBeenCalledTimes(2);
      const updateCall = send.mock.calls[1]?.[0];
      expect(updateCall).toMatchObject({
        DesiredCapacity: 1,
        AutoScalingGroupName: "gh-worker-asg",
      });
    });
  });

  describe("evaluate() — clamps to max (10)", () => {
    it("does not exceed maxCapacity even with large queue", async () => {
      setEnv({ JOBS_PER_WORKER: "1", AUTOSCALE_ASG_MAX: "10" });

      const db = makeDb([{ status: "active", count: "5" }], "0");
      const tqs = makeTaskQueueService({ queued: 50, active: 0, completed: 0, failed: 0, all: 50 });
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });
      const send = getAsgClientSend(service);

      // DescribeAutoScalingGroups returns current=5
      send.mockResolvedValueOnce({
        AutoScalingGroups: [{ DesiredCapacity: 5 }],
      });
      send.mockResolvedValueOnce({});

      await service.evaluate();

      // ceil(50 / 1) = 50, clamped [1, 10] = 10. Current=5 !== 10, so update.
      expect(send).toHaveBeenCalledTimes(2);
      const updateCall = send.mock.calls[1]?.[0];
      expect(updateCall).toMatchObject({
        DesiredCapacity: 10,
      });
    });
  });

  describe("evaluate() — skips AWS call when desired === current", () => {
    it("does not call UpdateAutoScalingGroup when capacity matches", async () => {
      setEnv({ JOBS_PER_WORKER: "3" });

      const db = makeDb([{ status: "active", count: "2" }], "1");
      // queue=3, desired=ceil(3/3)=1, current=1 => no change
      const tqs = makeTaskQueueService({ queued: 3, active: 0, completed: 0, failed: 0, all: 3 });
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });
      const send = getAsgClientSend(service);

      // DescribeAutoScalingGroups returns current=1 (matches desired=1)
      send.mockResolvedValueOnce({
        AutoScalingGroups: [{ DesiredCapacity: 1 }],
      });

      await service.evaluate();

      // Only the Describe call, no Update
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("evaluate() — disabled mode", () => {
    it("does nothing when AUTOSCALE_ASG_ENABLED is not true", async () => {
      // Don't set AUTOSCALE_ASG_ENABLED
      delete process.env.AUTOSCALE_ASG_ENABLED;

      const db = makeDb();
      const tqs = makeTaskQueueService({
        queued: 100,
        active: 0,
        completed: 0,
        failed: 0,
        all: 100,
      });
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });

      await service.evaluate();

      // No DB queries, no queue checks, no AWS calls
      expect(tqs.getQueueStats).not.toHaveBeenCalled();
      expect(db.execute).not.toHaveBeenCalled();
    });
  });

  describe("getFleetStatus()", () => {
    it("returns fleet status snapshot", async () => {
      setEnv();

      const db = makeDb(
        [
          { status: "active", count: "3" },
          { status: "draining", count: "1" },
          { status: "offline", count: "2" },
        ],
        "2",
      );
      const tqs = makeTaskQueueService({ queued: 5, active: 2, completed: 10, failed: 1, all: 18 });
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });
      const send = getAsgClientSend(service);

      send.mockResolvedValueOnce({
        AutoScalingGroups: [{ DesiredCapacity: 3 }],
      });

      const status = await service.getFleetStatus();

      expect(status.enabled).toBe(true);
      expect(status.asgName).toBe("gh-worker-asg");
      expect(status.currentCapacity).toBe(3);
      expect(status.queueDepth).toBe(5);
      expect(status.activeWorkers).toBe(3);
      expect(status.idleWorkers).toBe(2);
    });
  });

  describe("getWorkerStats()", () => {
    it("aggregates worker status counts from DB", async () => {
      setEnv();

      const db = makeDb(
        [
          { status: "active", count: "5" },
          { status: "draining", count: "1" },
          { status: "offline", count: "3" },
        ],
        "2",
      );
      const tqs = makeTaskQueueService();
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });

      const stats = await service.getWorkerStats();

      expect(stats.total).toBe(9);
      expect(stats.active).toBe(5);
      expect(stats.draining).toBe(1);
      expect(stats.offline).toBe(3);
      expect(stats.idle).toBe(2);
    });
  });

  describe("getCurrentCapacity()", () => {
    it("returns 0 when ASG client is not configured", async () => {
      delete process.env.AUTOSCALE_ASG_ENABLED;

      const db = makeDb();
      const tqs = makeTaskQueueService();
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });

      const capacity = await service.getCurrentCapacity();
      expect(capacity).toBe(0);
    });

    it("returns 0 when ASG is not found", async () => {
      setEnv();

      const db = makeDb();
      const tqs = makeTaskQueueService();
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });
      const send = getAsgClientSend(service);

      send.mockResolvedValueOnce({ AutoScalingGroups: [] });

      const capacity = await service.getCurrentCapacity();
      expect(capacity).toBe(0);
    });
  });

  describe("syncAsgIps()", () => {
    it("updates sandboxes and worker registry with current instance IPs", async () => {
      setEnv();
      process.env.GHOSTHANDS_API_URL = "http://10.0.0.1:3100";

      const db = makeDb();
      // syncAsgIps calls db.execute for each instance (sandboxes + worker_registry)
      (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const tqs = makeTaskQueueService();
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });

      mockEc2Send.mockResolvedValueOnce({
        Reservations: [
          {
            Instances: [
              { InstanceId: "i-abc123", PublicIpAddress: "1.2.3.4" },
              { InstanceId: "i-def456", PublicIpAddress: "5.6.7.8" },
            ],
          },
        ],
      });

      await service.syncAsgIps();

      // 2 instances x 2 updates each (sandboxes + worker_registry) = 4 calls
      // Plus the 2 from makeDb setup
      expect(db.execute).toHaveBeenCalled();
      // Should warn about GHOSTHANDS_API_URL mismatch
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ currentIps: ["1.2.3.4", "5.6.7.8"] }),
        expect.stringContaining("GHOSTHANDS_API_URL"),
      );
    });

    it("skips when disabled", async () => {
      delete process.env.AUTOSCALE_ASG_ENABLED;

      const db = makeDb();
      const tqs = makeTaskQueueService();
      const logger = makeLogger();

      const service = new AutoScaleService({ logger, taskQueueService: tqs, db });

      await service.syncAsgIps();

      expect(mockEc2Send).not.toHaveBeenCalled();
    });
  });
});
