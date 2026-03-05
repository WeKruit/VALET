import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoStopMonitor } from "../../auto-stop-monitor.js";
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
    currentLoad: 0, // legacy — not used by auto-stop logic
    sshKeyName: null,
    novncUrl: null,
    adspowerVersion: null,
    browserEngine: "chromium",
    browserConfig: null,
    tags: null,
    ec2Status: "running",
    lastStartedAt: null,
    lastStoppedAt: null,
    autoStopEnabled: true,
    autoStopOwner: "valet",
    idleMinutesBeforeStop: 30,
    machineType: "kasm",
    agentVersion: null,
    agentLastSeenAt: null,
    ghImageTag: null,
    ghImageUpdatedAt: null,
    deployedCommitSha: null,
    healthCheckFailureCount: 0,
    lastBecameIdleAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMocks() {
  const sandboxRepo = {
    findValetAutoStopCandidates: vi.fn().mockResolvedValue([]),
    setLastBecameIdleAt: vi.fn().mockResolvedValue(undefined),
  } as unknown as SandboxRepository;

  const sandboxService = {
    stopSandbox: vi.fn().mockResolvedValue(undefined),
  } as unknown as SandboxService;

  const taskRepo = {
    countActiveBySandboxIds: vi.fn().mockResolvedValue(new Map()),
  } as unknown as TaskRepository;

  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as FastifyBaseLogger;

  return { sandboxRepo, sandboxService, taskRepo, logger };
}

describe("AutoStopMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when no candidates exist", async () => {
    const mocks = makeMocks();
    const monitor = new AutoStopMonitor(mocks);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.taskRepo.countActiveBySandboxIds).not.toHaveBeenCalled();
    expect(mocks.sandboxService.stopSandbox).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("sandbox with active derived load → does not stop, clears lastBecameIdleAt", async () => {
    const mocks = makeMocks();
    const sb = makeSandbox({
      id: "sb-busy",
      lastBecameIdleAt: new Date(Date.now() - 60 * 60 * 1000), // was marked idle an hour ago
    });

    (mocks.sandboxRepo.findValetAutoStopCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      sb,
    ]);
    (mocks.taskRepo.countActiveBySandboxIds as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([["sb-busy", 2]]),
    );

    const monitor = new AutoStopMonitor(mocks);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    // Should clear the idle anchor since sandbox now has load
    expect(mocks.sandboxRepo.setLastBecameIdleAt).toHaveBeenCalledWith("sb-busy", null);
    expect(mocks.sandboxService.stopSandbox).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("sandbox transitions to zero load → sets lastBecameIdleAt, does not stop this cycle", async () => {
    const mocks = makeMocks();
    const sb = makeSandbox({ id: "sb-idle", lastBecameIdleAt: null });

    (mocks.sandboxRepo.findValetAutoStopCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      sb,
    ]);
    (mocks.taskRepo.countActiveBySandboxIds as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map(), // no active tasks
    );

    const monitor = new AutoStopMonitor(mocks);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    // Should set the idle anchor, NOT stop
    expect(mocks.sandboxRepo.setLastBecameIdleAt).toHaveBeenCalledWith("sb-idle", expect.any(Date));
    expect(mocks.sandboxService.stopSandbox).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("sandbox idle past threshold → stops (with pre-stop recheck)", async () => {
    const mocks = makeMocks();
    const sb = makeSandbox({
      id: "sb-expired",
      idleMinutesBeforeStop: 30,
      lastBecameIdleAt: new Date(Date.now() - 31 * 60 * 1000), // 31 min ago
    });

    (mocks.sandboxRepo.findValetAutoStopCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      sb,
    ]);
    // Both the main scan and the pre-stop recheck return zero load
    (mocks.taskRepo.countActiveBySandboxIds as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map(),
    );

    const monitor = new AutoStopMonitor(mocks);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    // Should call countActiveBySandboxIds twice: once for all candidates, once for recheck
    expect(mocks.taskRepo.countActiveBySandboxIds).toHaveBeenCalledTimes(2);
    expect(mocks.taskRepo.countActiveBySandboxIds).toHaveBeenCalledWith(["sb-expired"]);
    expect(mocks.sandboxService.stopSandbox).toHaveBeenCalledWith("sb-expired");

    monitor.stop();
  });

  it("sandbox idle below threshold → does not stop", async () => {
    const mocks = makeMocks();
    const sb = makeSandbox({
      id: "sb-waiting",
      idleMinutesBeforeStop: 30,
      lastBecameIdleAt: new Date(Date.now() - 10 * 60 * 1000), // only 10 min ago
    });

    (mocks.sandboxRepo.findValetAutoStopCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      sb,
    ]);
    (mocks.taskRepo.countActiveBySandboxIds as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map(),
    );

    const monitor = new AutoStopMonitor(mocks);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.sandboxService.stopSandbox).not.toHaveBeenCalled();
    // Should NOT trigger recheck since threshold not reached
    expect(mocks.taskRepo.countActiveBySandboxIds).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it("pre-stop recheck catches new load → does not stop, clears idle anchor", async () => {
    const mocks = makeMocks();
    const sb = makeSandbox({
      id: "sb-race",
      idleMinutesBeforeStop: 30,
      lastBecameIdleAt: new Date(Date.now() - 31 * 60 * 1000),
    });

    (mocks.sandboxRepo.findValetAutoStopCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      sb,
    ]);
    // Main scan: zero load. Recheck: load appeared.
    (mocks.taskRepo.countActiveBySandboxIds as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Map()) // main scan
      .mockResolvedValueOnce(new Map([["sb-race", 1]])); // pre-stop recheck

    const monitor = new AutoStopMonitor(mocks);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.sandboxService.stopSandbox).not.toHaveBeenCalled();
    expect(mocks.sandboxRepo.setLastBecameIdleAt).toHaveBeenCalledWith("sb-race", null);

    monitor.stop();
  });

  it("ASG-managed row excluded by findValetAutoStopCandidates (repository contract)", async () => {
    // This test verifies the contract: findValetAutoStopCandidates() is the only
    // source of candidates, and it excludes ASG-managed rows. We test that the
    // monitor does not independently re-include them.
    const mocks = makeMocks();
    // Simulate: repo returns no candidates (ASG rows filtered out)
    (mocks.sandboxRepo.findValetAutoStopCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    const monitor = new AutoStopMonitor(mocks);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.taskRepo.countActiveBySandboxIds).not.toHaveBeenCalled();
    expect(mocks.sandboxService.stopSandbox).not.toHaveBeenCalled();

    monitor.stop();
  });

  it("health-check updatedAt writes do not affect idle timing (uses lastBecameIdleAt)", async () => {
    const mocks = makeMocks();
    // Sandbox has been idle for 31 minutes (lastBecameIdleAt), but updatedAt is fresh
    // (simulating health check just bumped it). Auto-stop should still trigger.
    const sb = makeSandbox({
      id: "sb-health-checked",
      idleMinutesBeforeStop: 30,
      lastBecameIdleAt: new Date(Date.now() - 31 * 60 * 1000),
      updatedAt: new Date(), // just updated by health check — should be irrelevant
    });

    (mocks.sandboxRepo.findValetAutoStopCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      sb,
    ]);
    (mocks.taskRepo.countActiveBySandboxIds as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map(),
    );

    const monitor = new AutoStopMonitor(mocks);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    // Should stop despite fresh updatedAt — idle timing uses lastBecameIdleAt only
    expect(mocks.sandboxService.stopSandbox).toHaveBeenCalledWith("sb-health-checked");

    monitor.stop();
  });

  it("waiting_human load blocks auto-stop", async () => {
    const mocks = makeMocks();
    const sb = makeSandbox({
      id: "sb-waiting-human",
      idleMinutesBeforeStop: 30,
      lastBecameIdleAt: new Date(Date.now() - 60 * 60 * 1000), // idle for an hour
    });

    (mocks.sandboxRepo.findValetAutoStopCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      sb,
    ]);
    // countActiveBySandboxIds counts waiting_human as active
    (mocks.taskRepo.countActiveBySandboxIds as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([["sb-waiting-human", 1]]),
    );

    const monitor = new AutoStopMonitor(mocks);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    // Should NOT stop — waiting_human counts as active load
    expect(mocks.sandboxService.stopSandbox).not.toHaveBeenCalled();
    // Should clear idle anchor since there is load
    expect(mocks.sandboxRepo.setLastBecameIdleAt).toHaveBeenCalledWith("sb-waiting-human", null);

    monitor.stop();
  });
});
