import { describe, expect, it, vi } from "vitest";
import { LocalWorkerBrokerService } from "../../src/modules/local-workers/local-worker-broker.service.js";

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

    expect(result).toEqual({ leaseId: null, job: null });
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
});
