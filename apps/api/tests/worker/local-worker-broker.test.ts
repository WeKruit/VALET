import { describe, expect, it, vi } from "vitest";
import { LocalWorkerBrokerService } from "../../src/modules/local-workers/local-worker-broker.service.js";
import { createManagedRuntimeGrant } from "../../src/modules/local-workers/llm-runtime-auth.js";

function createRedisMock() {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const setValue = async (key: string, value: string, ...args: unknown[]) => {
    const hasNx = args.includes("NX");
    if (hasNx && strings.has(key)) {
      return null;
    }
    strings.set(key, value);
    return "OK";
  };

  const delValue = async (...keys: string[]) => {
    let deleted = 0;
    for (const key of keys) {
      if (strings.delete(key)) {
        deleted += 1;
      }
      if (sets.delete(key)) {
        deleted += 1;
      }
    }
    return deleted;
  };

  const saddValue = async (key: string, ...members: string[]) => {
    const set = sets.get(key) ?? new Set<string>();
    sets.set(key, set);
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added += 1;
      }
    }
    return added;
  };

  const sremValue = async (key: string, ...members: string[]) => {
    const set = sets.get(key);
    if (!set) {
      return 0;
    }
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) {
        removed += 1;
      }
    }
    if (set.size === 0) {
      sets.delete(key);
    }
    return removed;
  };

  const redis = {
    get: vi.fn(async (key: string) => strings.get(key) ?? null),
    set: vi.fn(setValue),
    del: vi.fn(delValue),
    sadd: vi.fn(saddValue),
    srem: vi.fn(sremValue),
    smembers: vi.fn(async (key: string) => [...(sets.get(key) ?? new Set<string>())]),
    pexpire: vi.fn(async () => 1),
    eval: vi.fn(async (_script: string, numKeys: number, ...args: string[]) => {
      const keys = args.slice(0, numKeys);
      const values = args.slice(numKeys);
      if (numKeys === 1) {
        const [key] = keys;
        const [expected] = values;
        if (strings.get(key) === expected) {
          strings.delete(key);
          return 1;
        }
        return 0;
      }

      let deleted = 0;
      for (const key of keys) {
        if (strings.get(key) === values[0]) {
          strings.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    }),
    multi: vi.fn(() => {
      const ops: Array<() => Promise<unknown>> = [];
      const chain = {
        set: (...args: Parameters<typeof setValue>) => {
          ops.push(() => setValue(...args));
          return chain;
        },
        del: (...keys: string[]) => {
          ops.push(() => delValue(...keys));
          return chain;
        },
        sadd: (key: string, ...members: string[]) => {
          ops.push(() => saddValue(key, ...members));
          return chain;
        },
        srem: (key: string, ...members: string[]) => {
          ops.push(() => sremValue(key, ...members));
          return chain;
        },
        pexpire: (_key: string, _ttl: number) => {
          ops.push(async () => 1);
          return chain;
        },
        exec: async () => {
          const results: Array<[Error | null, unknown]> = [];
          for (const op of ops) {
            try {
              results.push([null, await op()]);
            } catch (error) {
              results.push([error as Error, null]);
            }
          }
          return results;
        },
      };
      return chain;
    }),
  };

  return redis;
}

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
    (service as any).readWorkerLeases = vi.fn().mockResolvedValue([]);
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
    (service as any).readWorkerLeases = vi.fn().mockResolvedValue([]);
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

describe("LocalWorkerBrokerService multi-lease worker tracking", () => {
  it("allows a new claim when the worker only holds awaiting-review leases", async () => {
    const session = {
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      deviceId: "device-1",
      sessionToken: "session-token-1",
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 4_000,
      heartbeatIntervalMs: 15_000,
    };
    const redis = createRedisMock();
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue([
        {
          id: "pg-job-2",
          data: {
            ghJobId: "gh-job-2",
            valetTaskId: "task-2",
            userId: "user-1",
            targetUrl: "https://example.com/jobs/2",
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
        id: "gh-job-2",
        userId: "user-1",
        status: "queued",
        targetUrl: "https://example.com/jobs/2",
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
        id: "gh-job-2",
        userId: "user-1",
        status: "running",
        metadata: {},
      }),
    };
    const service = new LocalWorkerBrokerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any,
      pgBossService: { instance: boss } as any,
      ghJobRepo: ghJobRepo as any,
      ghJobEventRepo: {
        insertEvent: vi.fn(),
      } as any,
      taskQueueService: {} as any,
      redis: redis as any,
    });

    await (service as any).writeLease(
      {
        jobId: "gh-job-review",
        leaseId: "lease-review",
        desktopWorkerId: session.desktopWorkerId,
        pgBossJobId: "pg-review",
        queueName: "queue",
        queuePayload: {
          ghJobId: "gh-job-review",
          userId: session.userId,
          targetUrl: "https://example.com/review",
          platform: "other",
          jobType: "apply",
        },
      },
      "held",
    );

    (service as any).requireSessionByToken = vi.fn().mockResolvedValue(session);
    (service as any).refreshSession = vi.fn().mockResolvedValue(undefined);
    (service as any).syncValetTaskStatus = vi.fn().mockResolvedValue(undefined);

    const result = await service.claim({
      userId: session.userId,
      desktopWorkerId: session.desktopWorkerId,
      sessionToken: session.sessionToken,
    });

    expect(result.leaseId).toBeTruthy();
    expect(result.job).toMatchObject({ jobId: "gh-job-2" });
    expect(await redis.smembers(`gh:local-worker:worker-leases:${session.desktopWorkerId}`)).toEqual(
      expect.arrayContaining(["gh-job-review", "gh-job-2"]),
    );
    expect(await redis.get(`gh:local-worker:worker-running-lease:${session.desktopWorkerId}`)).toBe(
      "gh-job-2",
    );
  });

  it("denies a new claim while the worker already holds a running lease", async () => {
    const session = {
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      deviceId: "device-1",
      sessionToken: "session-token-1",
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 4_000,
      heartbeatIntervalMs: 15_000,
    };
    const redis = createRedisMock();
    const boss = {
      createQueue: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn(),
    };
    const service = new LocalWorkerBrokerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any,
      pgBossService: { instance: boss } as any,
      ghJobRepo: {} as any,
      ghJobEventRepo: {} as any,
      taskQueueService: {} as any,
      redis: redis as any,
    });

    await (service as any).writeLease(
      {
        jobId: "gh-job-1",
        leaseId: "lease-1",
        desktopWorkerId: session.desktopWorkerId,
        pgBossJobId: "pg-job-1",
        queueName: "queue",
        queuePayload: {
          ghJobId: "gh-job-1",
          userId: session.userId,
          targetUrl: "https://example.com/jobs/1",
          platform: "other",
          jobType: "apply",
        },
      },
      "running",
    );

    (service as any).requireSessionByToken = vi.fn().mockResolvedValue(session);
    (service as any).refreshSession = vi.fn().mockResolvedValue(undefined);

    const result = await service.claim({
      userId: session.userId,
      desktopWorkerId: session.desktopWorkerId,
      sessionToken: session.sessionToken,
    });

    expect(result).toEqual({
      leaseId: null,
      job: null,
      runtimeGrant: null,
      runtimeGrantExpiresAt: null,
    });
    expect(boss.fetch).not.toHaveBeenCalled();
  });

  it("refreshes both the running lease and held review leases on heartbeat", async () => {
    const session = {
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      deviceId: "device-1",
      sessionToken: "session-token-1",
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 4_000,
      heartbeatIntervalMs: 15_000,
    };
    const redis = createRedisMock();
    const updateStatusIfNotTerminal = vi.fn().mockImplementation(async (jobId: string, patch) => ({
      id: jobId,
      ...patch,
    }));
    const ghJobRepo = {
      findById: vi.fn(async (jobId: string) => {
        if (jobId === "gh-job-running") {
          return { id: jobId, status: "running" };
        }
        if (jobId === "gh-job-review") {
          return { id: jobId, status: "awaiting_review" };
        }
        return null;
      }),
      updateStatusIfNotTerminal,
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
      ghJobEventRepo: {} as any,
      taskQueueService: {} as any,
      redis: redis as any,
    });

    await (service as any).writeLease(
      {
        jobId: "gh-job-running",
        leaseId: "lease-running",
        desktopWorkerId: session.desktopWorkerId,
        pgBossJobId: "pg-running",
        queueName: "queue",
        queuePayload: {
          ghJobId: "gh-job-running",
          userId: session.userId,
          targetUrl: "https://example.com/jobs/running",
          platform: "other",
          jobType: "apply",
        },
      },
      "running",
    );
    await (service as any).writeLease(
      {
        jobId: "gh-job-review",
        leaseId: "lease-review",
        desktopWorkerId: session.desktopWorkerId,
        pgBossJobId: "pg-review",
        queueName: "queue",
        queuePayload: {
          ghJobId: "gh-job-review",
          userId: session.userId,
          targetUrl: "https://example.com/jobs/review",
          platform: "other",
          jobType: "apply",
        },
      },
      "held",
    );

    (service as any).requireSessionByToken = vi.fn().mockResolvedValue(session);
    (service as any).refreshSession = vi.fn().mockResolvedValue(undefined);

    await service.heartbeat({
      userId: session.userId,
      desktopWorkerId: session.desktopWorkerId,
      sessionToken: session.sessionToken,
      activeJobId: "gh-job-running",
      leaseId: "lease-running",
      reviewLeases: [{ jobId: "gh-job-review", leaseId: "lease-review" }],
    });

    expect(updateStatusIfNotTerminal).toHaveBeenCalledWith(
      "gh-job-running",
      expect.objectContaining({ status: "running" }),
    );
    expect(updateStatusIfNotTerminal).toHaveBeenCalledWith(
      "gh-job-review",
      expect.objectContaining({ status: "awaiting_review" }),
    );
    expect(await redis.get(`gh:local-worker:worker-running-lease:${session.desktopWorkerId}`)).toBe(
      "gh-job-running",
    );
    expect(await redis.smembers(`gh:local-worker:worker-leases:${session.desktopWorkerId}`)).toEqual(
      expect.arrayContaining(["gh-job-running", "gh-job-review"]),
    );
  });

  it("cancelling one held review lease does not remove a different running lease", async () => {
    const session = {
      userId: "user-1",
      desktopWorkerId: "desktop-worker-1",
      deviceId: "device-1",
      sessionToken: "session-token-1",
      expiresAt: Date.now() + 60_000,
      pollIntervalMs: 4_000,
      heartbeatIntervalMs: 15_000,
    };
    const redis = createRedisMock();
    const boss = {
      cancel: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
    };
    const ghJobRepo = {
      findById: vi.fn(async (jobId: string) => ({
        id: jobId,
        status: jobId === "gh-job-review" ? "awaiting_review" : "running",
      })),
      updateStatusIfNotTerminal: vi.fn().mockImplementation(async (jobId: string, patch) => ({
        id: jobId,
        ...patch,
      })),
    };
    const service = new LocalWorkerBrokerService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any,
      pgBossService: { instance: boss } as any,
      ghJobRepo: ghJobRepo as any,
      ghJobEventRepo: {
        insertEvent: vi.fn(),
      } as any,
      taskQueueService: {} as any,
      redis: redis as any,
    });

    await (service as any).writeLease(
      {
        jobId: "gh-job-running",
        leaseId: "lease-running",
        desktopWorkerId: session.desktopWorkerId,
        pgBossJobId: "pg-running",
        queueName: "queue",
        queuePayload: {
          ghJobId: "gh-job-running",
          userId: session.userId,
          targetUrl: "https://example.com/jobs/running",
          platform: "other",
          jobType: "apply",
        },
      },
      "running",
    );
    await (service as any).writeLease(
      {
        jobId: "gh-job-review",
        leaseId: "lease-review",
        desktopWorkerId: session.desktopWorkerId,
        pgBossJobId: "pg-review",
        queueName: "queue",
        queuePayload: {
          ghJobId: "gh-job-review",
          userId: session.userId,
          targetUrl: "https://example.com/jobs/review",
          platform: "other",
          jobType: "apply",
        },
      },
      "held",
    );

    (service as any).requireSessionByToken = vi.fn().mockResolvedValue(session);

    await service.cancel({
      userId: session.userId,
      sessionToken: session.sessionToken,
      jobId: "gh-job-review",
      leaseId: "lease-review",
    });

    expect(boss.cancel).toHaveBeenCalledWith("queue", "pg-review");
    expect(await (service as any).readLease("gh-job-running")).toMatchObject({
      leaseId: "lease-running",
    });
    expect(await (service as any).readWorkerLease(session.desktopWorkerId)).toMatchObject({
      jobId: "gh-job-running",
      leaseId: "lease-running",
    });
    expect(await redis.smembers(`gh:local-worker:worker-leases:${session.desktopWorkerId}`)).toEqual(
      ["gh-job-running"],
    );
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
