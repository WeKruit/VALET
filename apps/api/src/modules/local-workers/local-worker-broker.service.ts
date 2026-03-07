import { randomUUID } from "crypto";
import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { Job, PgBoss } from "pg-boss";
import type { PgBossService } from "../../services/pgboss.service.js";
import { publishToUser } from "../../websocket/handler.js";
import type { GhAutomationJobRepository } from "../ghosthands/gh-automation-job.repository.js";
import type { GhJobEventRepository } from "../ghosthands/gh-job-event.repository.js";
import {
  QUEUE_APPLY_JOB,
  type GhApplyJobPayload,
  type TaskQueueService,
} from "../tasks/task-queue.service.js";
import type { TaskRepository } from "../tasks/task.repository.js";
import {
  fromLocalProfileToGhUserData,
  LOCAL_WORKER_PROFILE_SCHEMA_VERSION,
  type LocalWorkerProfileV1,
  parseLocalWorkerProfileFromInputData,
} from "./local-worker-contracts.js";

const SESSION_TTL_MS = 65 * 60 * 1000;
const LEASE_TTL_MS = 4 * 60 * 60 * 1000;
const CLAIM_LOCK_TTL_MS = 30_000;

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

interface WorkerSession {
  userId: string;
  desktopWorkerId: string;
  deviceId: string;
  sessionToken: string;
  expiresAt: number;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}

interface ActiveLease {
  jobId: string;
  leaseId: string;
  desktopWorkerId: string;
  pgBossJobId: string;
  queueName: string;
  queuePayload: GhApplyJobPayload;
}

export interface SubmitLocalWorkerJobInput {
  desktopWorkerId: string;
  userId: string;
  targetUrl: string;
  profile: Record<string, unknown>;
  resumePath?: string;
  uiLabel?: string;
}

export class LocalWorkerBrokerError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function assertMultiExecSuccess(
  results: Array<[Error | null, unknown]> | null,
  label: string,
): void {
  if (!results) throw new Error(`${label}: multi/exec returned null (aborted)`);
  for (const [err] of results) {
    if (err) throw new Error(`${label}: ${err.message}`);
  }
}

export class LocalWorkerBrokerService {
  private readonly logger: FastifyBaseLogger;
  private readonly pgBossService: PgBossService;
  private readonly ghJobRepo: GhAutomationJobRepository;
  private readonly ghJobEventRepo: GhJobEventRepository;
  private readonly taskQueueService: TaskQueueService;
  private readonly taskRepo?: TaskRepository;
  private readonly redis: Redis;

  constructor({
    logger,
    pgBossService,
    ghJobRepo,
    ghJobEventRepo,
    taskQueueService,
    taskRepo,
    redis,
  }: {
    logger: FastifyBaseLogger;
    pgBossService: PgBossService;
    ghJobRepo: GhAutomationJobRepository;
    ghJobEventRepo: GhJobEventRepository;
    taskQueueService: TaskQueueService;
    taskRepo?: TaskRepository;
    redis: Redis;
  }) {
    this.logger = logger;
    this.pgBossService = pgBossService;
    this.ghJobRepo = ghJobRepo;
    this.ghJobEventRepo = ghJobEventRepo;
    this.taskQueueService = taskQueueService;
    this.taskRepo = taskRepo;
    this.redis = redis;
  }

  private isEnabled(): boolean {
    return process.env.GH_LOCAL_WORKER_BROKER_ENABLED !== "false";
  }

  private ensureEnabled(): void {
    if (!this.isEnabled()) {
      throw new LocalWorkerBrokerError(503, "BROKER_DISABLED", "Local worker broker is disabled");
    }
  }

  private buildCallbackUrl(): string {
    const base =
      process.env.GHOSTHANDS_CALLBACK_URL ??
      `${process.env.API_URL ?? "http://localhost:8000"}/api/v1/webhooks/ghosthands`;
    const secret = process.env.GH_SERVICE_SECRET;
    if (!secret) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}token=${encodeURIComponent(secret)}`;
  }

  private sessionKey(desktopWorkerId: string): string {
    return `gh:local-worker:session:${desktopWorkerId}`;
  }

  private sessionTokenKey(sessionToken: string): string {
    return `gh:local-worker:session-token:${sessionToken}`;
  }

  private leaseKey(jobId: string): string {
    return `gh:local-worker:lease:${jobId}`;
  }

  private workerLeaseKey(desktopWorkerId: string): string {
    return `gh:local-worker:worker-lease:${desktopWorkerId}`;
  }

  private workerClaimLockKey(desktopWorkerId: string): string {
    return `gh:local-worker:claim-lock:${desktopWorkerId}`;
  }

  private async readJson<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.redis.del(key);
      return null;
    }
  }

  private async writeSession(session: WorkerSession): Promise<void> {
    const ttlMs = Math.max(session.expiresAt - Date.now(), 1_000);
    const results = await this.redis
      .multi()
      .set(this.sessionKey(session.desktopWorkerId), JSON.stringify(session), "PX", ttlMs)
      .set(this.sessionTokenKey(session.sessionToken), session.desktopWorkerId, "PX", ttlMs)
      .exec();
    assertMultiExecSuccess(results, "writeSession");
  }

  private async readSessionByWorkerId(desktopWorkerId: string): Promise<WorkerSession | null> {
    const session = await this.readJson<WorkerSession>(this.sessionKey(desktopWorkerId));
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      await this.deleteSession(session);
      return null;
    }
    return session;
  }

  private async readSessionByToken(sessionToken: string): Promise<WorkerSession | null> {
    const desktopWorkerId = await this.redis.get(this.sessionTokenKey(sessionToken));
    if (!desktopWorkerId) return null;
    const session = await this.readSessionByWorkerId(desktopWorkerId);
    if (!session || session.sessionToken !== sessionToken) {
      await this.redis.del(this.sessionTokenKey(sessionToken));
      return null;
    }
    return session;
  }

  private async deleteSession(session: WorkerSession): Promise<void> {
    await this.redis.del(
      this.sessionKey(session.desktopWorkerId),
      this.sessionTokenKey(session.sessionToken),
    );
  }

  private async requireSessionForUser(
    userId: string,
    desktopWorkerId: string,
  ): Promise<WorkerSession> {
    const session = await this.readSessionByWorkerId(desktopWorkerId);
    if (!session || session.userId !== userId) {
      throw new LocalWorkerBrokerError(
        409,
        "WORKER_NOT_REGISTERED",
        "Local worker must be registered before submitting jobs",
      );
    }
    return session;
  }

  private async requireSessionByToken(
    sessionToken: string,
    desktopWorkerId?: string,
    expectedUserId?: string,
  ): Promise<WorkerSession> {
    const session = await this.readSessionByToken(sessionToken);
    if (!session) {
      throw new LocalWorkerBrokerError(401, "INVALID_SESSION", "Invalid or expired worker session");
    }
    if (desktopWorkerId && session.desktopWorkerId !== desktopWorkerId) {
      throw new LocalWorkerBrokerError(403, "WRONG_WORKER", "Worker session does not match worker");
    }
    if (expectedUserId && session.userId !== expectedUserId) {
      throw new LocalWorkerBrokerError(403, "WRONG_USER", "Worker session does not match user");
    }
    return session;
  }

  private async refreshSession(session: WorkerSession): Promise<WorkerSession> {
    const next = {
      ...session,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    await this.writeSession(next);
    return next;
  }

  private async writeLease(lease: ActiveLease): Promise<void> {
    const results = await this.redis
      .multi()
      .set(this.leaseKey(lease.jobId), JSON.stringify(lease), "PX", LEASE_TTL_MS)
      .set(this.workerLeaseKey(lease.desktopWorkerId), lease.jobId, "PX", LEASE_TTL_MS)
      .exec();
    assertMultiExecSuccess(results, "writeLease");
  }

  private async readLease(jobId: string): Promise<ActiveLease | null> {
    return this.readJson<ActiveLease>(this.leaseKey(jobId));
  }

  private async readWorkerLease(desktopWorkerId: string): Promise<ActiveLease | null> {
    const jobId = await this.redis.get(this.workerLeaseKey(desktopWorkerId));
    if (!jobId) return null;
    const lease = await this.readLease(jobId);
    if (!lease) {
      await this.redis.del(this.workerLeaseKey(desktopWorkerId));
      return null;
    }
    return lease;
  }

  private async deleteLease(lease: ActiveLease): Promise<void> {
    await this.redis.del(this.leaseKey(lease.jobId), this.workerLeaseKey(lease.desktopWorkerId));
  }

  private async acquireClaimLock(desktopWorkerId: string): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(
      this.workerClaimLockKey(desktopWorkerId),
      token,
      "PX",
      CLAIM_LOCK_TTL_MS,
      "NX",
    );
    return result === "OK" ? token : null;
  }

  private async releaseClaimLock(desktopWorkerId: string, token: string): Promise<void> {
    await this.redis.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        end
        return 0
      `,
      1,
      this.workerClaimLockKey(desktopWorkerId),
      token,
    );
  }

  private async requireLease(
    sessionToken: string,
    jobId: string,
    leaseId: string,
    expectedUserId?: string,
  ): Promise<{ session: WorkerSession; lease: ActiveLease }> {
    const session = await this.requireSessionByToken(sessionToken, undefined, expectedUserId);
    const lease = await this.readLease(jobId);
    if (!lease) {
      throw new LocalWorkerBrokerError(409, "LEASE_NOT_FOUND", "Active lease not found for job");
    }
    if (lease.leaseId !== leaseId) {
      throw new LocalWorkerBrokerError(409, "LEASE_MISMATCH", "Lease does not match active job");
    }
    if (lease.desktopWorkerId !== session.desktopWorkerId) {
      throw new LocalWorkerBrokerError(
        403,
        "WRONG_LEASE_OWNER",
        "Worker session does not own this lease",
      );
    }
    return { session, lease };
  }

  async requireCurrentLease(
    sessionToken: string,
    leaseId: string,
    expectedUserId?: string,
  ): Promise<{ session: WorkerSession; lease: ActiveLease }> {
    this.ensureEnabled();
    const session = await this.requireSessionByToken(sessionToken, undefined, expectedUserId);
    const lease = await this.readWorkerLease(session.desktopWorkerId);
    if (!lease) {
      throw new LocalWorkerBrokerError(409, "LEASE_NOT_FOUND", "Worker has no active lease");
    }
    if (lease.leaseId !== leaseId) {
      throw new LocalWorkerBrokerError(409, "LEASE_MISMATCH", "Lease does not match active job");
    }
    return { session, lease };
  }

  private requireBoss(): PgBoss {
    const boss = this.pgBossService.instance;
    if (!boss) {
      throw new LocalWorkerBrokerError(503, "QUEUE_UNAVAILABLE", "pg-boss is not available");
    }
    return boss;
  }

  private queueName(desktopWorkerId: string): string {
    return `${QUEUE_APPLY_JOB}/${desktopWorkerId}`;
  }

  private async completeFetchedJob(boss: PgBoss, queueName: string, id: string): Promise<void> {
    await boss.complete(queueName, id);
  }

  private async syncValetTaskStatus(
    ghJob: {
      id: string;
      userId?: string | null;
      valetTaskId?: string | null;
    },
    status: "queued" | "in_progress" | "waiting_human" | "completed" | "failed" | "cancelled",
    options?: {
      error?: {
        code?: string;
        message: string;
        details?: Record<string, unknown> | null;
      };
      result?: Record<string, unknown> | null;
      completedAt?: Date;
    },
  ): Promise<void> {
    if (!this.taskRepo || !ghJob.valetTaskId) {
      return;
    }

    const updatedTask = await this.taskRepo.updateStatusGuarded(ghJob.valetTaskId, status);
    if (!updatedTask) {
      return;
    }

    if (status === "completed" || status === "failed") {
      await this.taskRepo.updateGhosthandsResult(ghJob.valetTaskId, {
        ghJobId: ghJob.id,
        result: status === "completed" ? (options?.result ?? {}) : null,
        error:
          status === "failed"
            ? {
                code: options?.error?.code ?? "LOCAL_WORKER_FAILED",
                message: options?.error?.message ?? "Local worker failed",
                ...(options?.error?.details ? { details: options.error.details } : {}),
              }
            : null,
        completedAt: (options?.completedAt ?? new Date()).toISOString(),
      });
    }

    if (ghJob.userId) {
      await publishToUser(this.redis, ghJob.userId, {
        type: "task_update",
        taskId: ghJob.valetTaskId,
        status,
      });
    }
  }

  async registerWorker(input: {
    userId: string;
    desktopWorkerId: string;
    deviceId: string;
    appVersion: string;
  }): Promise<{
    desktopWorkerId: string;
    sessionToken: string;
    expiresAt: string;
    pollIntervalMs: number;
    heartbeatIntervalMs: number;
  }> {
    this.ensureEnabled();

    const existing = await this.readSessionByWorkerId(input.desktopWorkerId);
    if (existing && existing.userId !== input.userId) {
      throw new LocalWorkerBrokerError(
        409,
        "WORKER_ALREADY_OWNED",
        "Desktop worker ID is already registered to another user",
      );
    }

    const pollIntervalMs = 4_000;
    const heartbeatIntervalMs = 15_000;
    const session: WorkerSession = {
      userId: input.userId,
      desktopWorkerId: input.desktopWorkerId,
      deviceId: input.deviceId,
      sessionToken: randomUUID(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      pollIntervalMs,
      heartbeatIntervalMs,
    };
    await this.writeSession(session);

    this.logger.info(
      {
        desktopWorkerId: input.desktopWorkerId,
        userId: input.userId,
        appVersion: input.appVersion,
      },
      "Registered local desktop worker session",
    );

    return {
      desktopWorkerId: session.desktopWorkerId,
      sessionToken: session.sessionToken,
      expiresAt: new Date(session.expiresAt).toISOString(),
      pollIntervalMs,
      heartbeatIntervalMs,
    };
  }

  async submitSmartApply(input: SubmitLocalWorkerJobInput): Promise<{
    requestId: string;
    jobId: string;
  }> {
    this.ensureEnabled();
    await this.requireSessionForUser(input.userId, input.desktopWorkerId);

    if (!this.taskQueueService.isAvailable) {
      throw new LocalWorkerBrokerError(
        503,
        "QUEUE_UNAVAILABLE",
        "Local worker broker is enabled but pg-boss is unavailable",
      );
    }

    const requestId = randomUUID();
    const callbackUrl = this.buildCallbackUrl();
    const uiLabel = input.uiLabel ?? "smart_apply";
    const normalizedProfile = parseLocalWorkerProfileFromInputData({
      local_worker_profile: input.profile,
    }).profile;
    const ghUserData = fromLocalProfileToGhUserData(normalizedProfile);

    const ghJob = await this.ghJobRepo.createJob({
      userId: input.userId,
      jobType: "apply",
      targetUrl: input.targetUrl,
      inputData: {
        user_data: ghUserData,
        local_worker_profile: normalizedProfile,
        profile_schema_version: LOCAL_WORKER_PROFILE_SCHEMA_VERSION,
        desktop_resume_path: input.resumePath ?? null,
        desktop_resume_id: null,
        ui_mode_label: uiLabel,
      },
      priority: 5,
      maxRetries: 0,
      tags: ["desktop", "local-worker"],
      metadata: {
        dispatch_target: "desktop_local_worker",
        desktop_worker_id: input.desktopWorkerId,
        ui_mode_label: uiLabel,
      },
      targetWorkerId: input.desktopWorkerId,
      callbackUrl,
      valetTaskId: requestId,
      executionMode: "mastra",
      workerAffinity: "strict",
    });

    const pgBossJobId = await this.taskQueueService.enqueueApplyJob(
      {
        ghJobId: ghJob.id,
        valetTaskId: requestId,
        userId: input.userId,
        targetUrl: input.targetUrl,
        platform: "other",
        jobType: "apply",
        callbackUrl,
      },
      { targetWorkerId: input.desktopWorkerId },
    );

    if (!pgBossJobId) {
      await this.ghJobRepo.updateStatus(ghJob.id, {
        status: "failed",
        completedAt: new Date(),
        errorCode: "GH_QUEUE_UNAVAILABLE",
        errorDetails: {
          message: "pg-boss did not accept the desktop local-worker job (returned null)",
        },
        statusMessage: "Queue rejected desktop local-worker job",
      });

      await this.ghJobEventRepo.insertEvent({
        jobId: ghJob.id,
        eventType: "job_failed",
        fromStatus: ghJob.status,
        toStatus: "failed",
        message: "Queue rejected desktop local-worker job",
        actor: "valet",
        metadata: {
          code: "GH_QUEUE_UNAVAILABLE",
          desktopWorkerId: input.desktopWorkerId,
        },
      });

      throw new LocalWorkerBrokerError(
        503,
        "QUEUE_ENQUEUE_FAILED",
        "Failed to enqueue local worker job",
      );
    }

    await this.ghJobRepo.updateStatus(ghJob.id, {
      status: "queued",
      targetWorkerId: input.desktopWorkerId,
      metadata: {
        ...(ghJob.metadata ?? {}),
        dispatch_target: "desktop_local_worker",
        desktop_worker_id: input.desktopWorkerId,
        ui_mode_label: uiLabel,
        ...(pgBossJobId
          ? {
              pgBossJobId,
              pgBossQueueName: this.queueName(input.desktopWorkerId),
            }
          : {}),
      },
    });

    await this.ghJobEventRepo.insertEvent({
      jobId: ghJob.id,
      eventType: "job_queued",
      fromStatus: ghJob.status,
      toStatus: "queued",
      message: "Queued for desktop local worker",
      actor: "valet",
      metadata: {
        desktopWorkerId: input.desktopWorkerId,
        uiLabel,
      },
    });

    return {
      requestId,
      jobId: ghJob.id,
    };
  }

  async claim(input: { desktopWorkerId: string; sessionToken: string; userId: string }): Promise<{
    leaseId: string | null;
    job: Record<string, unknown> | null;
  }> {
    this.ensureEnabled();
    const session = await this.requireSessionByToken(
      input.sessionToken,
      input.desktopWorkerId,
      input.userId,
    );
    await this.refreshSession(session);

    const claimLockToken = await this.acquireClaimLock(session.desktopWorkerId);
    if (!claimLockToken) {
      this.logger.warn(
        {
          desktopWorkerId: session.desktopWorkerId,
        },
        "Worker attempted a concurrent claim while another claim was already in progress",
      );
      return { leaseId: null, job: null };
    }

    try {
      const existingLease = await this.readWorkerLease(session.desktopWorkerId);
      if (existingLease) {
        this.logger.warn(
          {
            desktopWorkerId: session.desktopWorkerId,
            activeJobId: existingLease.jobId,
          },
          "Worker attempted to claim while already holding a lease",
        );
        return { leaseId: null, job: null };
      }

      const boss = this.requireBoss();
      const queueName = this.queueName(session.desktopWorkerId);
      await boss.createQueue(queueName);

      const fetched = await boss.fetch<GhApplyJobPayload>(queueName, { batchSize: 1 });
      const fetchedJob: Job<GhApplyJobPayload> | undefined = fetched[0];
      if (!fetchedJob) {
        return { leaseId: null, job: null };
      }

      const queuePayload = fetchedJob.data ?? ({} as GhApplyJobPayload);
      if (!queuePayload.ghJobId) {
        await this.completeFetchedJob(boss, queueName, fetchedJob.id);
        return { leaseId: null, job: null };
      }

      const ghJob = await this.ghJobRepo.findById(queuePayload.ghJobId);
      if (!ghJob || ghJob.userId !== session.userId) {
        await this.completeFetchedJob(boss, queueName, fetchedJob.id);
        return { leaseId: null, job: null };
      }

      if (TERMINAL_STATUSES.has(ghJob.status)) {
        this.logger.warn(
          {
            jobId: ghJob.id,
            currentStatus: ghJob.status,
            desktopWorkerId: session.desktopWorkerId,
          },
          "Rejecting claim for job already in terminal state",
        );
        await this.completeFetchedJob(boss, queueName, fetchedJob.id);
        return { leaseId: null, job: null };
      }

      let inputData = ghJob.inputData ?? {};
      let normalizedProfile: LocalWorkerProfileV1;
      let profileSource: "canonical" | "legacy_user_data" = "canonical";
      try {
        const resolvedProfile = parseLocalWorkerProfileFromInputData(inputData);
        normalizedProfile = resolvedProfile.profile;
        profileSource = resolvedProfile.source;
      } catch (profileErr) {
        const message =
          profileErr instanceof Error ? profileErr.message : "Failed to normalize worker profile";
        this.logger.error(
          {
            err: profileErr,
            jobId: ghJob.id,
            desktopWorkerId: session.desktopWorkerId,
          },
          "Rejecting local-worker claim due to invalid profile payload",
        );
        await this.completeFetchedJob(boss, queueName, fetchedJob.id);
        const failedJob = await this.ghJobRepo.updateStatusIfNotTerminal(ghJob.id, {
          status: "failed",
          completedAt: new Date(),
          errorCode: "LOCAL_WORKER_PROFILE_INVALID",
          errorDetails: {
            message,
          },
          statusMessage: "Invalid local worker profile payload",
        });
        if (failedJob) {
          await this.syncValetTaskStatus(failedJob, "failed", {
            error: {
              code: "LOCAL_WORKER_PROFILE_INVALID",
              message,
            },
            completedAt: new Date(),
          });
          await this.ghJobEventRepo.insertEvent({
            jobId: ghJob.id,
            eventType: "job_failed",
            fromStatus: ghJob.status,
            toStatus: "failed",
            message: "Invalid local worker profile payload",
            actor: "valet",
            metadata: {
              code: "LOCAL_WORKER_PROFILE_INVALID",
              message,
            },
          });
        } else {
          this.logger.warn(
            { jobId: ghJob.id, currentStatus: ghJob.status },
            "Skipping invalid-profile failure transition because job is already terminal",
          );
        }
        return { leaseId: null, job: null };
      }

      if (profileSource === "legacy_user_data") {
        this.logger.warn(
          {
            jobId: ghJob.id,
            desktopWorkerId: session.desktopWorkerId,
          },
          "Local-worker claim normalized legacy snake_case profile payload",
        );
        const canonicalizedInputData = {
          ...inputData,
          local_worker_profile: normalizedProfile,
          profile_schema_version: LOCAL_WORKER_PROFILE_SCHEMA_VERSION,
        };
        try {
          await this.ghJobRepo.updateInputData(ghJob.id, canonicalizedInputData);
          inputData = canonicalizedInputData;
        } catch (writeErr) {
          this.logger.warn(
            {
              err: writeErr,
              jobId: ghJob.id,
            },
            "Failed to persist canonical local-worker profile backfill",
          );
        }
      }

      const leaseId = randomUUID();
      const lease: ActiveLease = {
        jobId: ghJob.id,
        leaseId,
        desktopWorkerId: session.desktopWorkerId,
        pgBossJobId: fetchedJob.id,
        queueName,
        queuePayload,
      };

      try {
        await this.writeLease(lease);
      } catch (leaseErr) {
        this.logger.error(
          {
            err: leaseErr,
            jobId: ghJob.id,
            pgBossJobId: fetchedJob.id,
            desktopWorkerId: session.desktopWorkerId,
          },
          "Redis lease write failed after pg-boss fetch; compensating with boss.complete() and marking GH job failed",
        );
        // Use complete() not fail() — retryLimit:0 means fail() is terminal and
        // leaves the pg-boss job in a failed state. complete() removes it cleanly.
        await boss.complete(queueName, fetchedJob.id);
        // Also mark the GH job row as failed so it doesn't stay stuck in "queued"
        const failedJob = await this.ghJobRepo.updateStatusIfNotTerminal(ghJob.id, {
          status: "failed",
          completedAt: new Date(),
          errorCode: "LEASE_WRITE_FAILED",
          errorDetails: {
            message: "Lease write failed after dispatch",
            originalError: leaseErr instanceof Error ? leaseErr.message : String(leaseErr),
          },
          statusMessage: "Lease write failed after dispatch",
        });
        if (!failedJob) {
          this.logger.warn(
            { jobId: ghJob.id, currentStatus: ghJob.status },
            "Skipping lease-write failure transition because job is already terminal",
          );
        }
        await this.syncValetTaskStatus(ghJob, "failed", {
          error: {
            code: "LEASE_WRITE_FAILED",
            message: "Lease write failed after dispatch",
            details: {
              originalError: leaseErr instanceof Error ? leaseErr.message : String(leaseErr),
            },
          },
          completedAt: new Date(),
        });
        throw leaseErr;
      }

      try {
        const claimedJob = await this.ghJobRepo.updateStatusIfNotTerminal(ghJob.id, {
          status: "running",
          startedAt: ghJob.startedAt ?? new Date(),
          lastHeartbeat: new Date(),
          workerId: session.desktopWorkerId,
          targetWorkerId: session.desktopWorkerId,
          statusMessage: "Claimed by desktop local worker",
          metadata: {
            ...(ghJob.metadata ?? {}),
            active_lease_id: leaseId,
          },
        });
        if (!claimedJob) {
          this.logger.warn(
            { jobId: ghJob.id, desktopWorkerId: session.desktopWorkerId },
            "Claim aborted because job became terminal before running transition",
          );
          await boss.complete(queueName, fetchedJob.id);
          await this.deleteLease(lease);
          return { leaseId: null, job: null };
        }

        await this.ghJobEventRepo.insertEvent({
          jobId: ghJob.id,
          eventType: "job_claimed",
          fromStatus: ghJob.status,
          toStatus: "running",
          message: "Claimed by desktop local worker",
          actor: "valet",
          metadata: {
            desktopWorkerId: session.desktopWorkerId,
            leaseId,
          },
        });
        await this.syncValetTaskStatus(claimedJob, "in_progress");
      } catch (postLeaseErr) {
        const errMsg = postLeaseErr instanceof Error ? postLeaseErr.message : String(postLeaseErr);
        this.logger.error(
          {
            err: postLeaseErr,
            jobId: ghJob.id,
            pgBossJobId: fetchedJob.id,
            desktopWorkerId: session.desktopWorkerId,
          },
          "Post-lease operation failed in claim(); rolling back lease, pg-boss job, and GH row",
        );
        await this.deleteLease(lease);
        await boss.fail(queueName, fetchedJob.id, { error: errMsg });
        const failedJob = await this.ghJobRepo.updateStatusIfNotTerminal(ghJob.id, {
          status: "failed",
          completedAt: new Date(),
          errorCode: "CLAIM_ROLLBACK",
          errorDetails: { message: errMsg },
          statusMessage: `Claim rollback: ${errMsg}`,
        });
        if (!failedJob) {
          this.logger.warn(
            { jobId: ghJob.id, currentStatus: ghJob.status },
            "Skipping claim rollback failure transition because job is already terminal",
          );
        }
        await this.syncValetTaskStatus(ghJob, "failed", {
          error: {
            code: "CLAIM_ROLLBACK",
            message: errMsg,
          },
          completedAt: new Date(),
        });
        throw postLeaseErr;
      }

      const resumePath =
        typeof inputData.desktop_resume_path === "string"
          ? inputData.desktop_resume_path
          : undefined;
      const resumeId =
        typeof inputData.desktop_resume_id === "string"
          ? inputData.desktop_resume_id
          : typeof inputData.resume_id === "string"
            ? inputData.resume_id
            : undefined;
      return {
        leaseId,
        job: {
          jobId: ghJob.id,
          leaseId,
          targetUrl: ghJob.targetUrl,
          jobType: ghJob.jobType ?? "apply",
          executionMode: ghJob.executionMode ?? "mastra",
          profile: normalizedProfile,
          profileSchemaVersion: LOCAL_WORKER_PROFILE_SCHEMA_VERSION,
          resumePath,
          resumeId,
          metadata: ghJob.metadata ?? {},
        },
      };
    } finally {
      await this.releaseClaimLock(session.desktopWorkerId, claimLockToken);
    }
  }

  async heartbeat(input: {
    userId: string;
    desktopWorkerId: string;
    sessionToken: string;
    activeJobId?: string;
    leaseId?: string;
  }): Promise<void> {
    this.ensureEnabled();
    const session = await this.requireSessionByToken(
      input.sessionToken,
      input.desktopWorkerId,
      input.userId,
    );
    await this.refreshSession(session);

    if (!input.activeJobId || !input.leaseId) {
      return;
    }

    const { lease } = await this.requireLease(
      input.sessionToken,
      input.activeJobId,
      input.leaseId,
      input.userId,
    );
    const ghJob = await this.ghJobRepo.findById(input.activeJobId);
    if (!ghJob) {
      throw new LocalWorkerBrokerError(404, "JOB_NOT_FOUND", "GhostHands job not found");
    }

    if (TERMINAL_STATUSES.has(ghJob.status)) {
      this.logger.warn(
        {
          jobId: input.activeJobId,
          currentStatus: ghJob.status,
          desktopWorkerId: input.desktopWorkerId,
        },
        "Ignoring heartbeat for job already in terminal state",
      );
      await this.deleteLease(lease);
      return;
    }

    await this.writeLease(lease);
    const nextStatus = ghJob.status === "awaiting_review" ? "awaiting_review" : "running";
    const updated = await this.ghJobRepo.updateStatusIfNotTerminal(input.activeJobId, {
      status: nextStatus,
      lastHeartbeat: new Date(),
    });
    if (!updated) {
      await this.deleteLease(lease);
    }
  }

  async recordEvents(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    leaseId: string;
    events: Array<Record<string, unknown>>;
  }): Promise<void> {
    this.ensureEnabled();
    const { lease } = await this.requireLease(
      input.sessionToken,
      input.jobId,
      input.leaseId,
      input.userId,
    );
    const ghJob = await this.ghJobRepo.findById(input.jobId);

    for (const event of input.events) {
      const eventType = typeof event.type === "string" ? event.type : "job_event";
      await this.ghJobEventRepo.insertEvent({
        jobId: input.jobId,
        eventType,
        fromStatus: ghJob?.status ?? null,
        message: typeof event.message === "string" ? event.message : null,
        actor: "desktop_worker",
        metadata: event,
      });
    }

    if (ghJob && TERMINAL_STATUSES.has(ghJob.status)) {
      this.logger.warn(
        {
          jobId: input.jobId,
          currentStatus: ghJob.status,
        },
        "Skipping status update for job already in terminal state (events recorded)",
      );
      await this.deleteLease(lease);
      return;
    }

    await this.writeLease(lease);
    const updated = await this.ghJobRepo.updateStatusIfNotTerminal(input.jobId, {
      status: ghJob?.status === "awaiting_review" ? "awaiting_review" : "running",
      lastHeartbeat: new Date(),
    });
    if (!updated) {
      await this.deleteLease(lease);
    }
  }

  async moveToAwaitingReview(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    leaseId: string;
    summary?: string;
  }): Promise<void> {
    this.ensureEnabled();
    const { lease } = await this.requireLease(
      input.sessionToken,
      input.jobId,
      input.leaseId,
      input.userId,
    );

    const ghJob = await this.ghJobRepo.findById(input.jobId);

    if (ghJob && TERMINAL_STATUSES.has(ghJob.status)) {
      this.logger.warn(
        { jobId: input.jobId, currentStatus: ghJob.status },
        "Ignoring awaiting-review transition for job already in terminal state",
      );
      await this.deleteLease(lease);
      return;
    }

    await this.writeLease(lease);
    const updated = await this.ghJobRepo.updateStatusIfNotTerminal(input.jobId, {
      status: "awaiting_review",
      lastHeartbeat: new Date(),
      statusMessage: input.summary ?? "Waiting for manual review",
    });
    if (!updated) {
      await this.deleteLease(lease);
      return;
    }

    await this.ghJobEventRepo.insertEvent({
      jobId: input.jobId,
      eventType: "manual_review_requested",
      fromStatus: ghJob?.status ?? null,
      toStatus: "awaiting_review",
      message: input.summary ?? "Waiting for manual review",
      actor: "desktop_worker",
      metadata: {
        leaseId: lease.leaseId,
      },
    });
    await this.syncValetTaskStatus(updated, "waiting_human");
  }

  async complete(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    leaseId: string;
    result?: Record<string, unknown>;
    summary?: string;
  }): Promise<{ actualStatus?: string }> {
    this.ensureEnabled();
    const session = await this.requireSessionByToken(input.sessionToken, undefined, input.userId);
    const ghJob = await this.ghJobRepo.findById(input.jobId);

    if (ghJob && TERMINAL_STATUSES.has(ghJob.status)) {
      const lease = await this.readLease(input.jobId);
      if (
        !lease ||
        lease.desktopWorkerId !== session.desktopWorkerId ||
        lease.leaseId !== input.leaseId
      ) {
        return { actualStatus: ghJob.status };
      }
      this.logger.warn(
        { jobId: input.jobId, currentStatus: ghJob.status },
        "Ignoring complete for job already in terminal state",
      );
      const boss = this.requireBoss();
      await boss.complete(lease.queueName, lease.pgBossJobId);
      await this.deleteLease(lease);
      return { actualStatus: ghJob.status };
    }

    const { lease } = await this.requireLease(
      input.sessionToken,
      input.jobId,
      input.leaseId,
      input.userId,
    );

    const boss = this.requireBoss();
    await boss.complete(lease.queueName, lease.pgBossJobId);

    try {
      const updated = await this.ghJobRepo.updateStatusIfNotTerminal(input.jobId, {
        status: "completed",
        completedAt: new Date(),
        lastHeartbeat: new Date(),
        resultData: input.result ?? null,
        resultSummary: input.summary ?? "Completed by desktop local worker",
        statusMessage: "Completed by desktop local worker",
      });
      if (!updated) {
        this.logger.warn(
          { jobId: input.jobId },
          "Skipping complete transition because job is already terminal",
        );
        return { actualStatus: ghJob?.status ?? "completed" };
      }

      await this.ghJobEventRepo.insertEvent({
        jobId: input.jobId,
        eventType: "job_completed",
        fromStatus: ghJob?.status ?? null,
        toStatus: "completed",
        message: input.summary ?? "Completed by desktop local worker",
        actor: "desktop_worker",
        metadata: input.result ?? null,
      });
      await this.syncValetTaskStatus(updated, "completed", {
        result: input.result ?? null,
        completedAt: new Date(),
      });
    } finally {
      await this.deleteLease(lease);
    }
    return {};
  }

  async fail(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    leaseId: string;
    error: string;
    code?: string;
    details?: Record<string, unknown>;
  }): Promise<{ actualStatus?: string }> {
    this.ensureEnabled();
    const session = await this.requireSessionByToken(input.sessionToken, undefined, input.userId);
    const ghJob = await this.ghJobRepo.findById(input.jobId);

    if (ghJob && TERMINAL_STATUSES.has(ghJob.status)) {
      const lease = await this.readLease(input.jobId);
      if (
        !lease ||
        lease.desktopWorkerId !== session.desktopWorkerId ||
        lease.leaseId !== input.leaseId
      ) {
        return { actualStatus: ghJob.status };
      }
      this.logger.warn(
        { jobId: input.jobId, currentStatus: ghJob.status },
        "Ignoring fail for job already in terminal state",
      );
      const boss = this.requireBoss();
      await boss.complete(lease.queueName, lease.pgBossJobId);
      await this.deleteLease(lease);
      return { actualStatus: ghJob.status };
    }

    const { lease } = await this.requireLease(
      input.sessionToken,
      input.jobId,
      input.leaseId,
      input.userId,
    );

    const boss = this.requireBoss();
    await boss.fail(lease.queueName, lease.pgBossJobId, { error: input.error });

    try {
      const updated = await this.ghJobRepo.updateStatusIfNotTerminal(input.jobId, {
        status: "failed",
        completedAt: new Date(),
        lastHeartbeat: new Date(),
        errorCode: input.code ?? "LOCAL_WORKER_FAILED",
        errorDetails: input.details ?? { message: input.error },
        statusMessage: input.error,
      });
      if (!updated) {
        this.logger.warn(
          { jobId: input.jobId },
          "Skipping fail transition because job is already terminal",
        );
        return { actualStatus: ghJob?.status ?? "failed" };
      }

      await this.ghJobEventRepo.insertEvent({
        jobId: input.jobId,
        eventType: "job_failed",
        fromStatus: ghJob?.status ?? null,
        toStatus: "failed",
        message: input.error,
        actor: "desktop_worker",
        metadata: input.details ?? null,
      });
      await this.syncValetTaskStatus(updated, "failed", {
        error: {
          code: input.code ?? "LOCAL_WORKER_FAILED",
          message: input.error,
          details: input.details ?? null,
        },
        completedAt: new Date(),
      });
    } finally {
      await this.deleteLease(lease);
    }
    return {};
  }

  async release(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    leaseId: string;
    reason: string;
  }): Promise<void> {
    this.ensureEnabled();

    if (input.reason.startsWith("cancel")) {
      return this.cancelJob(input);
    }

    const { session, lease } = await this.requireLease(
      input.sessionToken,
      input.jobId,
      input.leaseId,
      input.userId,
    );
    const ghJob = await this.ghJobRepo.findById(input.jobId);
    const boss = this.requireBoss();
    await boss.complete(lease.queueName, lease.pgBossJobId);
    await this.deleteLease(lease);

    let requeuedPgBossJobId: string | null = null;
    try {
      requeuedPgBossJobId = await this.taskQueueService.enqueueApplyJob(lease.queuePayload, {
        targetWorkerId: session.desktopWorkerId,
      });
    } catch (error) {
      this.logger.error(
        {
          err: error,
          jobId: input.jobId,
          desktopWorkerId: session.desktopWorkerId,
        },
        "Failed to requeue released desktop local worker job",
      );
    }

    if (!requeuedPgBossJobId) {
      const updated = await this.ghJobRepo.updateStatusIfNotTerminal(input.jobId, {
        status: "failed",
        completedAt: new Date(),
        lastHeartbeat: new Date(),
        errorCode: "LOCAL_WORKER_REQUEUE_FAILED",
        errorDetails: { reason: input.reason },
        statusMessage: "Failed to requeue desktop local worker job",
      });

      if (updated) {
        await this.ghJobEventRepo.insertEvent({
          jobId: input.jobId,
          eventType: "job_requeue_failed",
          fromStatus: ghJob?.status ?? null,
          toStatus: "failed",
          message: "Failed to requeue desktop local worker job",
          actor: "valet",
          metadata: {
            desktopWorkerId: lease.desktopWorkerId,
            reason: input.reason,
          },
        });
      }

      throw new LocalWorkerBrokerError(
        503,
        "REQUEUE_FAILED",
        "Failed to requeue desktop local worker job",
      );
    }

    const requeued = await this.ghJobRepo.updateStatusIfNotTerminal(input.jobId, {
      status: "queued",
      lastHeartbeat: new Date(),
      statusMessage: input.reason,
      metadata: {
        ...(ghJob?.metadata ?? {}),
        pgBossJobId: requeuedPgBossJobId,
        pgBossQueueName: this.queueName(session.desktopWorkerId),
      },
    });
    if (!requeued) {
      this.logger.warn(
        { jobId: input.jobId },
        "Skipping release->queued transition because job is already terminal",
      );
      return;
    }

    await this.ghJobEventRepo.insertEvent({
      jobId: input.jobId,
      eventType: "job_released",
      fromStatus: ghJob?.status ?? null,
      toStatus: "queued",
      message: input.reason,
      actor: "desktop_worker",
      metadata: {
        desktopWorkerId: lease.desktopWorkerId,
        pgBossJobId: requeuedPgBossJobId,
      },
    });
    await this.syncValetTaskStatus(requeued, "queued");
  }

  async cancel(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    leaseId: string;
  }): Promise<void> {
    return this.cancelJob({ ...input, reason: "cancelled" });
  }

  private async cancelJob(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    leaseId: string;
    reason: string;
  }): Promise<void> {
    this.ensureEnabled();
    const { lease } = await this.requireLease(
      input.sessionToken,
      input.jobId,
      input.leaseId,
      input.userId,
    );
    const ghJob = await this.ghJobRepo.findById(input.jobId);

    if (ghJob && TERMINAL_STATUSES.has(ghJob.status)) {
      this.logger.warn(
        { jobId: input.jobId, currentStatus: ghJob.status },
        "Ignoring cancel for job already in terminal state",
      );
      const boss = this.requireBoss();
      await boss.complete(lease.queueName, lease.pgBossJobId);
      await this.deleteLease(lease);
      return;
    }

    const boss = this.requireBoss();
    await boss.cancel(lease.queueName, lease.pgBossJobId);

    try {
      const updated = await this.ghJobRepo.updateStatusIfNotTerminal(input.jobId, {
        status: "cancelled",
        completedAt: new Date(),
        lastHeartbeat: new Date(),
        statusMessage: input.reason ?? "Cancelled by user",
      });
      if (!updated) {
        this.logger.warn(
          { jobId: input.jobId },
          "Skipping cancel transition because job is already terminal",
        );
        return;
      }

      await this.ghJobEventRepo.insertEvent({
        jobId: input.jobId,
        eventType: "job_cancelled",
        fromStatus: ghJob?.status ?? null,
        toStatus: "cancelled",
        message: input.reason ?? "Cancelled by user",
        actor: "desktop_worker",
        metadata: {
          desktopWorkerId: lease.desktopWorkerId,
          leaseId: lease.leaseId,
        },
      });
      await this.syncValetTaskStatus(updated, "cancelled");
    } finally {
      await this.deleteLease(lease);
    }
  }
}
