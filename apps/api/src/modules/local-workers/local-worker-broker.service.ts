import { randomUUID } from "crypto";
import type { FastifyBaseLogger } from "fastify";
import type { PgBossService } from "../../services/pgboss.service.js";
import type { GhAutomationJobRepository } from "../ghosthands/gh-automation-job.repository.js";
import type { GhJobEventRepository } from "../ghosthands/gh-job-event.repository.js";
import {
  QUEUE_APPLY_JOB,
  type GhApplyJobPayload,
  type TaskQueueService,
} from "../tasks/task-queue.service.js";

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

export class LocalWorkerBrokerService {
  private readonly sessions = new Map<string, WorkerSession>();
  private readonly leases = new Map<string, ActiveLease>();
  private readonly logger: FastifyBaseLogger;
  private readonly pgBossService: PgBossService;
  private readonly ghJobRepo: GhAutomationJobRepository;
  private readonly ghJobEventRepo: GhJobEventRepository;
  private readonly taskQueueService: TaskQueueService;

  constructor({
    logger,
    pgBossService,
    ghJobRepo,
    ghJobEventRepo,
    taskQueueService,
  }: {
    logger: FastifyBaseLogger;
    pgBossService: PgBossService;
    ghJobRepo: GhAutomationJobRepository;
    ghJobEventRepo: GhJobEventRepository;
    taskQueueService: TaskQueueService;
  }) {
    this.logger = logger;
    this.pgBossService = pgBossService;
    this.ghJobRepo = ghJobRepo;
    this.ghJobEventRepo = ghJobEventRepo;
    this.taskQueueService = taskQueueService;
  }

  private isEnabled(): boolean {
    return process.env.GH_LOCAL_WORKER_BROKER_ENABLED === "true";
  }

  private ensureEnabled(): void {
    if (!this.isEnabled()) {
      throw new Error("Local worker broker is disabled");
    }
  }

  private buildCallbackUrl(): string {
    const base =
      process.env.GHOSTHANDS_CALLBACK_URL ??
      `${process.env.API_URL ?? "http://localhost:8000"}/api/v1/webhooks/ghosthands`;
    const token = process.env.GH_SERVICE_SECRET;
    if (!token) return base;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${token}`;
  }

  private getSession(
    userId: string,
    desktopWorkerId: string,
    sessionToken?: string,
  ): WorkerSession {
    const session = this.sessions.get(desktopWorkerId);
    if (!session || session.userId !== userId) {
      throw new Error("Unknown local worker session");
    }
    if (sessionToken && session.sessionToken !== sessionToken) {
      throw new Error("Invalid local worker session token");
    }
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(desktopWorkerId);
      throw new Error("Local worker session expired");
    }
    return session;
  }

  private getSessionByToken(userId: string, sessionToken: string): WorkerSession {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.userId === userId &&
        candidate.sessionToken === sessionToken &&
        candidate.expiresAt > Date.now(),
    );
    if (!session) {
      throw new Error("Invalid local worker session token");
    }
    return session;
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

    const pollIntervalMs = 4_000;
    const heartbeatIntervalMs = 15_000;
    const session: WorkerSession = {
      userId: input.userId,
      desktopWorkerId: input.desktopWorkerId,
      deviceId: input.deviceId,
      sessionToken: randomUUID(),
      expiresAt: Date.now() + 60 * 60 * 1000,
      pollIntervalMs,
      heartbeatIntervalMs,
    };
    this.sessions.set(input.desktopWorkerId, session);

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
    this.getSession(input.userId, input.desktopWorkerId);

    if (!this.taskQueueService.isAvailable) {
      throw new Error("Local worker broker is enabled but pg-boss is unavailable");
    }

    const requestId = randomUUID();
    const callbackUrl = this.buildCallbackUrl();
    const uiLabel = input.uiLabel ?? "smart_apply";

    const ghJob = await this.ghJobRepo.createJob({
      userId: input.userId,
      jobType: "apply",
      targetUrl: input.targetUrl,
      inputData: {
        user_data: input.profile,
        desktop_resume_path: input.resumePath ?? null,
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
              pgBossQueueName: `${QUEUE_APPLY_JOB}/${input.desktopWorkerId}`,
            }
          : {}),
      },
    });

    await this.ghJobEventRepo.insertEvent({
      jobId: ghJob.id,
      eventType: "job_queued",
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

  async claim(input: { userId: string; desktopWorkerId: string; sessionToken: string }): Promise<{
    leaseId: string | null;
    job: Record<string, unknown> | null;
  }> {
    this.ensureEnabled();
    this.getSession(input.userId, input.desktopWorkerId, input.sessionToken);

    const boss = this.pgBossService.instance as any;
    if (!boss) {
      throw new Error("pg-boss is not available");
    }

    const queueName = `${QUEUE_APPLY_JOB}/${input.desktopWorkerId}`;
    await boss.createQueue(queueName);

    const fetchedRaw = await boss.fetch(queueName);
    const fetched = Array.isArray(fetchedRaw) ? fetchedRaw[0] : fetchedRaw;
    if (!fetched) {
      return {
        leaseId: null,
        job: null,
      };
    }

    const queuePayload = (fetched.data ?? fetched.payload ?? {}) as GhApplyJobPayload;
    const ghJobId = queuePayload.ghJobId;
    if (!ghJobId) {
      await boss.complete(queueName, fetched.id);
      return {
        leaseId: null,
        job: null,
      };
    }

    const ghJob = await this.ghJobRepo.findById(ghJobId);
    if (!ghJob || ghJob.userId !== input.userId) {
      await boss.complete(queueName, fetched.id);
      return {
        leaseId: null,
        job: null,
      };
    }

    const leaseId = randomUUID();
    this.leases.set(ghJob.id, {
      jobId: ghJob.id,
      leaseId,
      desktopWorkerId: input.desktopWorkerId,
      pgBossJobId: fetched.id,
      queueName,
      queuePayload,
    });

    await this.ghJobRepo.updateStatus(ghJob.id, {
      status: "running",
      startedAt: ghJob.startedAt ?? new Date(),
      lastHeartbeat: new Date(),
      workerId: input.desktopWorkerId,
      targetWorkerId: input.desktopWorkerId,
      statusMessage: "Claimed by desktop local worker",
      metadata: {
        ...(ghJob.metadata ?? {}),
        active_lease_id: leaseId,
      },
    });

    await this.ghJobEventRepo.insertEvent({
      jobId: ghJob.id,
      eventType: "job_claimed",
      fromStatus: ghJob.status,
      toStatus: "running",
      message: "Claimed by desktop local worker",
      actor: "valet",
      metadata: {
        desktopWorkerId: input.desktopWorkerId,
        leaseId,
      },
    });

    const inputData = ghJob.inputData ?? {};
    return {
      leaseId,
      job: {
        jobId: ghJob.id,
        leaseId,
        targetUrl: ghJob.targetUrl,
        jobType: ghJob.jobType ?? "apply",
        executionMode: ghJob.executionMode ?? "mastra",
        profile: (inputData.user_data as Record<string, unknown>) ?? {},
        resumePath: (inputData.desktop_resume_path as string) ?? undefined,
        metadata: ghJob.metadata ?? {},
      },
    };
  }

  async heartbeat(input: {
    userId: string;
    desktopWorkerId: string;
    sessionToken: string;
    activeJobId?: string;
  }): Promise<void> {
    this.ensureEnabled();
    const session = this.getSession(input.userId, input.desktopWorkerId, input.sessionToken);
    session.expiresAt = Date.now() + 60 * 60 * 1000;

    if (input.activeJobId) {
      const lease = this.leases.get(input.activeJobId);
      if (lease && lease.desktopWorkerId === input.desktopWorkerId) {
        await this.ghJobRepo.updateStatus(input.activeJobId, {
          status: "running",
          lastHeartbeat: new Date(),
        });
      }
    }
  }

  async recordEvents(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    events: Array<Record<string, unknown>>;
  }): Promise<void> {
    this.ensureEnabled();
    const session = this.getSessionByToken(input.userId, input.sessionToken);
    const lease = this.leases.get(input.jobId);
    if (!lease || lease.desktopWorkerId !== session.desktopWorkerId) {
      throw new Error("Active lease not found for job");
    }

    for (const event of input.events) {
      const eventType = typeof event.type === "string" ? event.type : "job_event";
      await this.ghJobEventRepo.insertEvent({
        jobId: input.jobId,
        eventType,
        message: typeof event.message === "string" ? event.message : null,
        actor: "desktop_worker",
        metadata: event,
      });
    }

    await this.ghJobRepo.updateStatus(input.jobId, {
      status: "running",
      lastHeartbeat: new Date(),
    });
  }

  async complete(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    result?: Record<string, unknown>;
    summary?: string;
  }): Promise<void> {
    this.ensureEnabled();
    const session = this.getSessionByToken(input.userId, input.sessionToken);
    const lease = this.leases.get(input.jobId);
    if (!lease || lease.desktopWorkerId !== session.desktopWorkerId) {
      throw new Error("Active lease not found for job");
    }

    await this.ghJobRepo.updateStatus(input.jobId, {
      status: "completed",
      completedAt: new Date(),
      lastHeartbeat: new Date(),
      resultData: input.result ?? null,
      resultSummary: input.summary ?? "Completed by desktop local worker",
      statusMessage: "Completed by desktop local worker",
    });

    await this.ghJobEventRepo.insertEvent({
      jobId: input.jobId,
      eventType: "job_completed",
      toStatus: "completed",
      message: input.summary ?? "Completed by desktop local worker",
      actor: "desktop_worker",
      metadata: input.result ?? null,
    });

    const boss = this.pgBossService.instance as any;
    if (boss) {
      await boss.complete(lease.queueName, lease.pgBossJobId);
    }
    this.leases.delete(input.jobId);
  }

  async fail(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    error: string;
    code?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    this.ensureEnabled();
    const session = this.getSessionByToken(input.userId, input.sessionToken);
    const lease = this.leases.get(input.jobId);
    if (!lease || lease.desktopWorkerId !== session.desktopWorkerId) {
      throw new Error("Active lease not found for job");
    }

    await this.ghJobRepo.updateStatus(input.jobId, {
      status: "failed",
      completedAt: new Date(),
      lastHeartbeat: new Date(),
      errorCode: input.code ?? "LOCAL_WORKER_FAILED",
      errorDetails: input.details ?? { message: input.error },
      statusMessage: input.error,
    });

    await this.ghJobEventRepo.insertEvent({
      jobId: input.jobId,
      eventType: "job_failed",
      toStatus: "failed",
      message: input.error,
      actor: "desktop_worker",
      metadata: input.details ?? null,
    });

    const boss = this.pgBossService.instance as any;
    if (boss) {
      await boss.fail(lease.queueName, lease.pgBossJobId, input.error);
    }
    this.leases.delete(input.jobId);
  }

  async release(input: {
    userId: string;
    sessionToken: string;
    jobId: string;
    reason: string;
  }): Promise<void> {
    this.ensureEnabled();
    const session = this.getSessionByToken(input.userId, input.sessionToken);
    const lease = this.leases.get(input.jobId);
    if (!lease || lease.desktopWorkerId !== session.desktopWorkerId) {
      throw new Error("Active lease not found for job");
    }

    const boss = this.pgBossService.instance as any;
    if (boss) {
      await boss.send(lease.queueName, lease.queuePayload, {
        retryLimit: 0,
        expireInSeconds: 14_400,
      });
      await boss.complete(lease.queueName, lease.pgBossJobId);
    }

    await this.ghJobRepo.updateStatus(input.jobId, {
      status: "queued",
      lastHeartbeat: new Date(),
      statusMessage: input.reason,
    });

    await this.ghJobEventRepo.insertEvent({
      jobId: input.jobId,
      eventType: "job_released",
      toStatus: "queued",
      message: input.reason,
      actor: "desktop_worker",
      metadata: {
        desktopWorkerId: lease.desktopWorkerId,
      },
    });

    this.leases.delete(input.jobId);
  }
}
