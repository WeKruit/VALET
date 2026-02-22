import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SandboxHealthMonitor } from "../../sandbox-health-monitor.js";

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeSandboxService() {
  return {
    checkAllSandboxes: vi.fn().mockResolvedValue([]),
    enforceStateConsistency: vi.fn().mockResolvedValue(0),
    sendKeepalive: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSandboxRepo() {
  return {
    incrementHealthFailureCount: vi.fn().mockResolvedValue(1),
    resetHealthFailureCount: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(null),
  };
}

function makeHealthResult(
  overrides: Partial<{
    sandboxId: string;
    healthStatus: string;
    details: unknown;
  }> = {},
) {
  return {
    sandboxId: "sandbox-1",
    healthStatus: "healthy",
    details: {},
    ...overrides,
  };
}

describe("SandboxHealthMonitor", () => {
  let monitor: SandboxHealthMonitor;
  let sandboxService: ReturnType<typeof makeSandboxService>;
  let sandboxRepo: ReturnType<typeof makeSandboxRepo>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.useFakeTimers();
    sandboxService = makeSandboxService();
    sandboxRepo = makeSandboxRepo();
    logger = makeLogger();
    monitor = new SandboxHealthMonitor({
      sandboxService: sandboxService as never,
      sandboxRepo: sandboxRepo as never,
      logger: logger as never,
    });
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  it("calls incrementHealthFailureCount when sandbox is unhealthy", async () => {
    sandboxService.checkAllSandboxes.mockResolvedValue([
      makeHealthResult({ sandboxId: "sb-1", healthStatus: "unhealthy" }),
    ]);
    sandboxRepo.incrementHealthFailureCount.mockResolvedValue(1);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(sandboxRepo.incrementHealthFailureCount).toHaveBeenCalledWith("sb-1");
  });

  it("calls incrementHealthFailureCount when sandbox is degraded", async () => {
    sandboxService.checkAllSandboxes.mockResolvedValue([
      makeHealthResult({ sandboxId: "sb-2", healthStatus: "degraded" }),
    ]);
    sandboxRepo.incrementHealthFailureCount.mockResolvedValue(1);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(sandboxRepo.incrementHealthFailureCount).toHaveBeenCalledWith("sb-2");
  });

  it("calls resetHealthFailureCount when sandbox is healthy", async () => {
    sandboxService.checkAllSandboxes.mockResolvedValue([
      makeHealthResult({ sandboxId: "sb-3", healthStatus: "healthy" }),
    ]);
    sandboxRepo.resetHealthFailureCount.mockResolvedValue(0);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(sandboxRepo.resetHealthFailureCount).toHaveBeenCalledWith("sb-3");
  });

  it("logs recovery when resetHealthFailureCount returns a count > 0", async () => {
    sandboxService.checkAllSandboxes.mockResolvedValue([
      makeHealthResult({ sandboxId: "sb-4", healthStatus: "healthy" }),
    ]);
    sandboxRepo.resetHealthFailureCount.mockResolvedValue(3);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sb-4",
        recoveredAfter: 3,
      }),
      expect.stringContaining("recovered"),
    );
  });

  it("does not log recovery when failure count was already 0", async () => {
    sandboxService.checkAllSandboxes.mockResolvedValue([
      makeHealthResult({ sandboxId: "sb-5", healthStatus: "healthy" }),
    ]);
    sandboxRepo.resetHealthFailureCount.mockResolvedValue(0);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    const recoveryCalls = logger.info.mock.calls.filter(
      (call: unknown[]) => typeof call[1] === "string" && call[1].includes("recovered"),
    );
    expect(recoveryCalls).toHaveLength(0);
  });

  it("logs ALERT when consecutive failures reach threshold (3)", async () => {
    sandboxService.checkAllSandboxes.mockResolvedValue([
      makeHealthResult({ sandboxId: "sb-6", healthStatus: "unhealthy" }),
    ]);
    sandboxRepo.incrementHealthFailureCount.mockResolvedValue(3);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: "sb-6",
        consecutiveFailures: 3,
      }),
      expect.stringContaining("ALERT"),
    );
  });

  it("does not log ALERT when failures below threshold", async () => {
    sandboxService.checkAllSandboxes.mockResolvedValue([
      makeHealthResult({ sandboxId: "sb-7", healthStatus: "unhealthy" }),
    ]);
    sandboxRepo.incrementHealthFailureCount.mockResolvedValue(2);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    const alertCalls = logger.error.mock.calls.filter(
      (call: unknown[]) => typeof call[1] === "string" && call[1].includes("ALERT"),
    );
    expect(alertCalls).toHaveLength(0);
  });

  it("does not call findById (no extra round-trip for healthy sandboxes)", async () => {
    sandboxService.checkAllSandboxes.mockResolvedValue([
      makeHealthResult({ sandboxId: "sb-8", healthStatus: "healthy" }),
    ]);
    sandboxRepo.resetHealthFailureCount.mockResolvedValue(0);

    monitor.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(sandboxRepo.findById).not.toHaveBeenCalled();
  });
});
