import { describe, expect, it, vi } from "vitest";
import { LocalWorkerBrokerService } from "../../src/modules/local-workers/local-worker-broker.service.js";
import { createManagedRuntimeGrant } from "../../src/modules/local-workers/llm-runtime-auth.js";

describe("LocalWorkerBrokerService complete/fail terminal handling", () => {
  it("returns actualStatus when the job is terminal and the lease is already gone", async () => {
    const sessionToken = "session-token-1";
    const desktopWorkerId = "desktop-worker-1";
    const service = new LocalWorkerBrokerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any,
      pgBossService: { instance: null } as any,
      ghJobRepo: {
        findById: vi.fn().mockResolvedValue({
          id: "gh-job-1",
          status: "cancelled",
        }),
      } as any,
      ghJobEventRepo: {} as any,
      taskQueueService: {} as any,
      redis: {
        get: vi.fn(async (key: string) => {
          if (key === `gh:local-worker:session-token:${sessionToken}`) {
            return desktopWorkerId;
          }
          if (key === `gh:local-worker:session:${desktopWorkerId}`) {
            return JSON.stringify({
              userId: "user-1",
              desktopWorkerId,
              deviceId: "device-1",
              sessionToken,
              expiresAt: Date.now() + 60_000,
              pollIntervalMs: 4_000,
              heartbeatIntervalMs: 15_000,
            });
          }
          return null;
        }),
        del: vi.fn(),
      } as any,
    });

    const result = await service.complete({
      userId: "user-1",
      sessionToken,
      jobId: "gh-job-1",
      leaseId: "missing-lease",
      summary: "done",
    });

    expect(result).toEqual({ actualStatus: "cancelled" });
  });
});

describe("LocalWorkerBrokerService claim error handling", () => {
  it("does not overwrite a terminal job when invalid profile claim loses the race", async () => {
    const session = {
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      deviceId: "device-1",
      sessionToken: "session-token-1",
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 4_000,
      heartbeatIntervalMs: 15_000,
    };
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue([
        {
          id: "pg-job-1",
          data: {
            ghJobId: "gh-job-1",
            valetTaskId: "task-1",
            userId: "user-1",
            targetUrl: "https://example.com/jobs/1",
            platform: "other",
            jobType: "apply",
          },
        },
      ]),
      complete: vi.fn().mockResolvedValue(undefined),
    };
    const ghJobRepo = {
      findById: vi.fn().mockResolvedValue({
        id: "gh-job-1",
        userId: "user-1",
        status: "queued",
        targetUrl: "https://example.com/jobs/1",
        inputData: {},
        metadata: {},
      }),
      updateStatusIfNotTerminal: vi.fn().mockResolvedValue(null),
    };
    const ghJobEventRepo = {
      insertEvent: vi.fn(),
    };
    const service = new LocalWorkerBrokerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any,
      pgBossService: { instance: null } as any,
      ghJobRepo: ghJobRepo as any,
      ghJobEventRepo: ghJobEventRepo as any,
      taskQueueService: {} as any,
      redis: {} as any,
    });

    (service as any).requireSessionByToken = vi.fn().mockResolvedValue(session);
    (service as any).refreshSession = vi.fn().mockResolvedValue(undefined);
    (service as any).acquireClaimLock = vi.fn().mockResolvedValue("claim-lock");
    (service as any).releaseClaimLock = vi.fn().mockResolvedValue(undefined);
    (service as any).readWorkerLease = vi.fn().mockResolvedValue(null);
    (service as any).requireBoss = vi.fn().mockReturnValue(boss);

    const result = await service.claim({
      userId: "user-1",
      desktopWorkerId: session.desktopWorkerId,
      sessionToken: session.sessionToken,
    });

    expect(result).toEqual({
      leaseId: null,
      job: null,
      runtimeGrant: null,
      runtimeGrantExpiresAt: null,
    });
    expect(ghJobRepo.updateStatusIfNotTerminal).toHaveBeenCalledWith(
      "gh-job-1",
      expect.objectContaining({
        status: "failed",
        errorCode: "LOCAL_WORKER_PROFILE_INVALID",
      }),
    );
    expect(ghJobEventRepo.insertEvent).not.toHaveBeenCalled();
    expect(boss.complete).toHaveBeenCalledWith(
      expect.stringContaining("desktop-worker-1"),
      "pg-job-1",
    );
  });

  it("returns a runtime grant with a successful claim", async () => {
    const session = {
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      deviceId: "device-1",
      sessionToken: "session-token-1",
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 4_000,
      heartbeatIntervalMs: 15_000,
    };
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue([
        {
          id: "pg-job-1",
          data: {
            ghJobId: "gh-job-1",
            valetTaskId: "task-1",
            userId: "user-1",
            targetUrl: "https://example.com/jobs/1",
            platform: "other",
            jobType: "apply",
          },
        },
      ]),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    };
    const ghJobRepo = {
      findById: vi.fn().mockResolvedValue({
        id: "gh-job-1",
        userId: "user-1",
        status: "queued",
        targetUrl: "https://example.com/jobs/1",
        inputData: {
          local_worker_profile: {
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
            phone: "555-0100",
            city: "Austin",
            state: "TX",
            workAuthorization: "US Citizen",
            skills: ["TypeScript"],
            experience: [],
            education: [],
          },
          profile_schema_version: "local_worker_profile.v1",
        },
        metadata: {},
      }),
      updateStatusIfNotTerminal: vi.fn().mockResolvedValue({
        id: "gh-job-1",
        userId: "user-1",
        status: "running",
        metadata: {},
      }),
    };
    const ghJobEventRepo = {
      insertEvent: vi.fn(),
    };
    const redisMultiExec = vi.fn().mockResolvedValue([
      [null, "OK"],
      [null, "OK"],
    ]);
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      multi: vi.fn(() => ({
        set: vi.fn().mockReturnThis(),
        exec: redisMultiExec,
      })),
      eval: vi.fn().mockResolvedValue(1),
    };
    const service = new LocalWorkerBrokerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any,
      pgBossService: { instance: null } as any,
      ghJobRepo: ghJobRepo as any,
      ghJobEventRepo: ghJobEventRepo as any,
      taskQueueService: {} as any,
      redis: redis as any,
    });

    (service as any).requireSessionByToken = vi.fn().mockResolvedValue(session);
    (service as any).refreshSession = vi.fn().mockResolvedValue(undefined);
    (service as any).acquireClaimLock = vi.fn().mockResolvedValue("claim-lock");
    (service as any).releaseClaimLock = vi.fn().mockResolvedValue(undefined);
    (service as any).readWorkerLease = vi.fn().mockResolvedValue(null);
    (service as any).requireBoss = vi.fn().mockReturnValue(boss);
    (service as any).writeLease = vi.fn().mockResolvedValue(undefined);
    (service as any).syncValetTaskStatus = vi.fn().mockResolvedValue(undefined);

    const result = await service.claim({
      userId: "user-1",
      desktopWorkerId: session.desktopWorkerId,
      sessionToken: session.sessionToken,
    });

    expect(result.leaseId).toBeTruthy();
    expect(result.job).toMatchObject({
      jobId: "gh-job-1",
      targetUrl: "https://example.com/jobs/1",
    });
    expect(result.runtimeGrant).toMatch(/^lwrg_v1_/);
    expect(result.runtimeGrantExpiresAt).toEqual(expect.any(String));
  });
});

describe("LocalWorkerBrokerService requireRuntimeGrant", () => {
  it("rejects expired runtime grants", async () => {
    const grant = createManagedRuntimeGrant();
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
    };
    const service = new LocalWorkerBrokerService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      pgBossService: { instance: null } as any,
      ghJobRepo: {} as any,
      ghJobEventRepo: {} as any,
      taskQueueService: {} as any,
      redis: redis as any,
    });

    (service as any).readJson = vi.fn().mockResolvedValue({
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      sessionToken: "session-token-1",
      jobId: "gh-job-1",
      leaseId: "lease-1",
      expiresAt: Date.now() - 1_000,
    });

    await expect(service.requireRuntimeGrant(grant)).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_RUNTIME_GRANT",
    });
    expect(redis.del).toHaveBeenCalled();
  });

  it("rejects mismatched session or lease ownership", async () => {
    const grant = createManagedRuntimeGrant();
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
    };
    const service = new LocalWorkerBrokerService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      pgBossService: { instance: null } as any,
      ghJobRepo: {} as any,
      ghJobEventRepo: {} as any,
      taskQueueService: {} as any,
      redis: redis as any,
    });

    (service as any).readJson = vi.fn().mockResolvedValue({
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      sessionToken: "session-token-1",
      jobId: "gh-job-1",
      leaseId: "lease-1",
      expiresAt: Date.now() + 60_000,
    });
    (service as any).requireSessionByToken = vi.fn().mockResolvedValue({
      userId: "user-1",
      desktopWorkerId: "desktop-worker-2",
      sessionToken: "session-token-1",
      expiresAt: Date.now() + 60_000,
    });
    (service as any).readLease = vi.fn().mockResolvedValue({
      jobId: "gh-job-1",
      leaseId: "lease-1",
      desktopWorkerId: "desktop-worker-1",
    });

    await expect(service.requireRuntimeGrant(grant)).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_RUNTIME_GRANT",
    });
    expect(redis.del).toHaveBeenCalled();
  });

  it("rejects revoked runtime grants after lease deletion", async () => {
    const grant = createManagedRuntimeGrant();
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
    };
    const service = new LocalWorkerBrokerService({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      pgBossService: { instance: null } as any,
      ghJobRepo: {} as any,
      ghJobEventRepo: {} as any,
      taskQueueService: {} as any,
      redis: redis as any,
    });

    (service as any).readJson = vi.fn().mockResolvedValue({
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      sessionToken: "session-token-1",
      jobId: "gh-job-1",
      leaseId: "lease-1",
      expiresAt: Date.now() + 60_000,
    });
    (service as any).requireSessionByToken = vi.fn().mockResolvedValue({
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      sessionToken: "session-token-1",
      expiresAt: Date.now() + 60_000,
    });
    (service as any).readLease = vi.fn().mockResolvedValue(null);

    await expect(service.requireRuntimeGrant(grant)).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_RUNTIME_GRANT",
    });
    expect(redis.del).toHaveBeenCalled();
  });
});
