import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoScaleMonitor } from "../../auto-scale-monitor.js";
import type { SandboxRepository, SandboxRecord } from "../../sandbox.repository.js";
import type { SandboxService } from "../../sandbox.service.js";
import type { TaskRepository } from "../../../tasks/task.repository.js";
import type { FastifyBaseLogger } from "fastify";

function makeSandbox(overrides: Partial<SandboxRecord> = {}): SandboxRecord {
  return {
    id: `sandbox-${Math.random().toString(36).slice(2, 8)}`,
    name: "kasm-sandbox",
    environment: "prod",
    instanceId: "kasm-123",
    instanceType: "kasm",
    publicIp: "10.0.0.1",
    privateIp: null,
    status: "active",
    healthStatus: "healthy",
    lastHealthCheckAt: new Date(),
    capacity: 1,
    currentLoad: 0,
    sshKeyName: null,
    novncUrl: null,
    adspowerVersion: null,
    browserEngine: "chromium",
    browserConfig: null,
    tags: null,
    ec2Status: "running",
    lastStartedAt: null,
    lastStoppedAt: null,
    autoStopEnabled: false,
    idleMinutesBeforeStop: 30,
    machineType: "kasm",
    agentVersion: null,
    agentLastSeenAt: null,
    ghImageTag: null,
    ghImageUpdatedAt: null,
    deployedCommitSha: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMocks() {
  const sandboxRepo = {
    findByMachineType: vi.fn().mockResolvedValue([]),
  } as unknown as SandboxRepository;

  const sandboxService = {
    create: vi.fn().mockResolvedValue(makeSandbox({ id: "new-sandbox-id" })),
    startSandbox: vi.fn().mockResolvedValue(undefined),
    stopSandbox: vi.fn().mockResolvedValue(undefined),
  } as unknown as SandboxService;

  const taskRepo = {
    countQueued: vi.fn().mockResolvedValue(0),
  } as unknown as TaskRepository;

  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as FastifyBaseLogger;

  return { sandboxRepo, sandboxService, taskRepo, logger };
}

describe("AutoScaleMonitor", () => {
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
    it("does nothing when AUTOSCALE_ENABLED is not 'true'", () => {
      delete process.env.AUTOSCALE_ENABLED;
      const mocks = makeMocks();
      const monitor = new AutoScaleMonitor(mocks);

      monitor.start();

      expect(mocks.logger.info).toHaveBeenCalledWith(expect.stringContaining("disabled"));

      // Advance time — evaluate should never be called
      vi.advanceTimersByTime(60_000);
      expect(mocks.taskRepo.countQueued).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe("evaluate()", () => {
    function makeEnabledMonitor(mocks: ReturnType<typeof makeMocks>) {
      process.env.AUTOSCALE_ENABLED = "true";
      process.env.AUTOSCALE_MIN_INSTANCES = "1";
      process.env.AUTOSCALE_MAX_INSTANCES = "3";
      process.env.AUTOSCALE_CHECK_INTERVAL_MS = "1000";
      process.env.AUTOSCALE_COOLDOWN_MS = "5000";
      return new AutoScaleMonitor(mocks);
    }

    it("scales up when queue > 0, no idle, below max", async () => {
      const mocks = makeMocks();
      (mocks.taskRepo.countQueued as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      (mocks.sandboxRepo.findByMachineType as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSandbox({ id: "sb-1", currentLoad: 1, ec2Status: "running" }),
      ]);

      const monitor = makeEnabledMonitor(mocks);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(mocks.sandboxService.create).toHaveBeenCalledTimes(1);
      expect(mocks.sandboxService.startSandbox).toHaveBeenCalledWith("new-sandbox-id");

      monitor.stop();
    });

    it("scales down when queue = 0, idle > min", async () => {
      const mocks = makeMocks();
      (mocks.taskRepo.countQueued as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      (mocks.sandboxRepo.findByMachineType as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSandbox({ id: "sb-1", currentLoad: 0, ec2Status: "running" }),
        makeSandbox({ id: "sb-2", currentLoad: 0, ec2Status: "running" }),
        makeSandbox({ id: "sb-3", currentLoad: 0, ec2Status: "running" }),
      ]);

      const monitor = makeEnabledMonitor(mocks);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1_000);

      // 3 idle > min(1), so should scale down one
      expect(mocks.sandboxService.stopSandbox).toHaveBeenCalledTimes(1);
      expect(mocks.sandboxService.stopSandbox).toHaveBeenCalledWith("sb-3");

      monitor.stop();
    });

    it("respects cooldown period", async () => {
      const mocks = makeMocks();
      (mocks.taskRepo.countQueued as ReturnType<typeof vi.fn>).mockResolvedValue(5);
      (mocks.sandboxRepo.findByMachineType as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSandbox({ id: "sb-1", currentLoad: 1, ec2Status: "running" }),
      ]);

      const monitor = makeEnabledMonitor(mocks);
      monitor.start();

      // First tick triggers scale-up
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mocks.sandboxService.create).toHaveBeenCalledTimes(1);

      // Second tick within cooldown (5s) — should not scale again
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mocks.sandboxService.create).toHaveBeenCalledTimes(1);

      // After cooldown expires (advance past 5s total)
      await vi.advanceTimersByTimeAsync(4_000);
      expect(mocks.sandboxService.create).toHaveBeenCalledTimes(2);

      monitor.stop();
    });

    it("does not scale up when at max running instances", async () => {
      const mocks = makeMocks();
      (mocks.taskRepo.countQueued as ReturnType<typeof vi.fn>).mockResolvedValue(5);
      // 3 running (all busy) — at max of 3
      (mocks.sandboxRepo.findByMachineType as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSandbox({ id: "sb-1", currentLoad: 1, ec2Status: "running" }),
        makeSandbox({ id: "sb-2", currentLoad: 1, ec2Status: "running" }),
        makeSandbox({ id: "sb-3", currentLoad: 1, ec2Status: "running" }),
      ]);

      const monitor = makeEnabledMonitor(mocks);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(mocks.sandboxService.create).not.toHaveBeenCalled();

      monitor.stop();
    });

    it("does not scale down when idle <= min", async () => {
      const mocks = makeMocks();
      (mocks.taskRepo.countQueued as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      // 1 idle sandbox, min is 1 — should not scale down
      (mocks.sandboxRepo.findByMachineType as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSandbox({ id: "sb-1", currentLoad: 0, ec2Status: "running" }),
      ]);

      const monitor = makeEnabledMonitor(mocks);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(mocks.sandboxService.stopSandbox).not.toHaveBeenCalled();

      monitor.stop();
    });

    it("counts running + pending for max check (excludes stopped)", async () => {
      const mocks = makeMocks();
      (mocks.taskRepo.countQueued as ReturnType<typeof vi.fn>).mockResolvedValue(5);
      // 2 running (busy) + 1 stopped — activeCount is 2, below max(3)
      (mocks.sandboxRepo.findByMachineType as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeSandbox({ id: "sb-1", currentLoad: 1, ec2Status: "running" }),
        makeSandbox({ id: "sb-2", currentLoad: 1, ec2Status: "running" }),
        makeSandbox({ id: "sb-3", currentLoad: 0, ec2Status: "stopped" }),
      ]);

      const monitor = makeEnabledMonitor(mocks);
      monitor.start();

      await vi.advanceTimersByTimeAsync(1_000);

      // activeCount (running+pending) = 2, below max(3), so should scale up
      expect(mocks.sandboxService.create).toHaveBeenCalledTimes(1);

      monitor.stop();
    });
  });
});
