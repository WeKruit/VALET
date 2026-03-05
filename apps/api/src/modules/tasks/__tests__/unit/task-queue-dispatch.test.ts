import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TaskQueueService, QUEUE_APPLY_JOB } from "../../task-queue.service.js";
import type { GhApplyJobPayload } from "../../task-queue.service.js";

function makeMockPgBoss() {
  return {
    send: vi.fn().mockResolvedValue("pgboss-job-id-1"),
    createQueue: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    getQueue: vi.fn().mockResolvedValue(null),
  };
}

function makeMockPgBossService(boss: ReturnType<typeof makeMockPgBoss> | null = null) {
  return {
    get instance() {
      return boss;
    },
    get isStarted() {
      return boss !== null;
    },
  };
}

function makeMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makePayload(overrides: Partial<GhApplyJobPayload> = {}): GhApplyJobPayload {
  return {
    ghJobId: "gh-job-1",
    valetTaskId: "valet-task-1",
    userId: "user-1",
    targetUrl: "https://example.com/job",
    platform: "workday",
    jobType: "apply",
    callbackUrl: "https://api.example.com/webhook",
    ...overrides,
  };
}

describe("TaskQueueService — queue dispatch", () => {
  let boss: ReturnType<typeof makeMockPgBoss>;
  let service: TaskQueueService;
  let logger: ReturnType<typeof makeMockLogger>;

  beforeEach(() => {
    boss = makeMockPgBoss();
    logger = makeMockLogger();
    service = new TaskQueueService({
      pgBossService: makeMockPgBossService(boss) as never,
      ghJobRepo: {} as never,
      logger: logger as never,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses general queue name 'gh_apply_job' when no targetWorkerId", async () => {
    await service.enqueueApplyJob(makePayload());

    expect(boss.createQueue).toHaveBeenCalledWith(QUEUE_APPLY_JOB);
    expect(boss.send).toHaveBeenCalledWith(QUEUE_APPLY_JOB, expect.anything(), expect.anything());
  });

  it("uses worker-specific queue 'gh_apply_job/{workerId}' when targetWorkerId set", async () => {
    await service.enqueueApplyJob(makePayload(), { targetWorkerId: "worker-123" });

    const expectedQueue = `${QUEUE_APPLY_JOB}/worker-123`;
    expect(boss.createQueue).toHaveBeenCalledWith(expectedQueue);
    expect(boss.send).toHaveBeenCalledWith(expectedQueue, expect.anything(), expect.anything());
  });

  it("passes singletonKey=valetTaskId to prevent duplicate dispatch", async () => {
    await service.enqueueApplyJob(makePayload({ valetTaskId: "task-dedup-1" }));

    expect(boss.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ singletonKey: "task-dedup-1" }),
    );
  });

  it("omits singletonKey when valetTaskId is empty string", async () => {
    await service.enqueueApplyJob(makePayload({ valetTaskId: "" }));

    const sendOptions = boss.send.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(sendOptions).not.toHaveProperty("singletonKey");
  });

  it("returns null when pg-boss instance is null (not available)", async () => {
    const unavailableService = new TaskQueueService({
      pgBossService: makeMockPgBossService(null) as never,
      ghJobRepo: {} as never,
      logger: logger as never,
    });

    const result = await unavailableService.enqueueApplyJob(makePayload());
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("pg-boss not available"));
  });

  it("calls boss.createQueue before boss.send (queue creation order)", async () => {
    const callOrder: string[] = [];
    boss.createQueue.mockImplementation(async () => {
      callOrder.push("createQueue");
    });
    boss.send.mockImplementation(async () => {
      callOrder.push("send");
      return "job-id";
    });

    await service.enqueueApplyJob(makePayload());

    expect(callOrder).toEqual(["createQueue", "send"]);
  });

  it("sets retryLimit=0 and expireInSeconds=14400 in send options", async () => {
    await service.enqueueApplyJob(makePayload());

    expect(boss.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        retryLimit: 0,
        expireInSeconds: 14400,
      }),
    );
  });

  it("fires ATM wake when ATM_WAKE_ENABLED=true", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = mockFetch;

    vi.stubEnv("ATM_WAKE_ENABLED", "true");
    vi.stubEnv("ATM_BASE_URL", "https://atm.example.com");
    vi.stubEnv("ATM_DEPLOY_SECRET", "test-secret");

    // Create a fresh service so it picks up env vars
    const freshService = new TaskQueueService({
      pgBossService: makeMockPgBossService(boss) as never,
      ghJobRepo: {} as never,
      logger: logger as never,
    });

    await freshService.enqueueApplyJob(makePayload());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://atm.example.com/fleet/wake",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Deploy-Secret": "test-secret",
        }),
      }),
    );

    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("skips ATM wake when ATM_WAKE_ENABLED is not true", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = mockFetch;

    vi.stubEnv("ATM_WAKE_ENABLED", "false");

    const freshService = new TaskQueueService({
      pgBossService: makeMockPgBossService(boss) as never,
      ghJobRepo: {} as never,
      logger: logger as never,
    });

    await freshService.enqueueApplyJob(makePayload());

    expect(mockFetch).not.toHaveBeenCalled();

    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("cancelJob calls boss.cancel, returns false when boss is unavailable", async () => {
    // With boss available — cancel succeeds
    const result = await service.cancelJob("pgboss-job-1");
    expect(result).toBe(true);
    expect(boss.cancel).toHaveBeenCalledWith(QUEUE_APPLY_JOB, "pgboss-job-1");

    // Without boss — returns false
    const unavailableService = new TaskQueueService({
      pgBossService: makeMockPgBossService(null) as never,
      ghJobRepo: {} as never,
      logger: logger as never,
    });
    const result2 = await unavailableService.cancelJob("pgboss-job-1");
    expect(result2).toBe(false);
  });
});
