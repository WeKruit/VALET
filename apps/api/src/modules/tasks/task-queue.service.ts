import type { FastifyBaseLogger } from "fastify";
import type { PgBossService } from "../../services/pgboss.service.js";
import type { GhAutomationJobRepository } from "../ghosthands/gh-automation-job.repository.js";

/** Payload for a job application task enqueued via pg-boss */
export interface GhApplyJobPayload {
  ghJobId: string;
  valetTaskId: string;
  userId: string;
  targetUrl: string;
  platform: string;
  jobType: "apply" | "custom";
  callbackUrl: string;
}

/** Payload for a generic task enqueued via pg-boss */
export interface GhGenericTaskPayload {
  ghJobId: string;
  valetTaskId: string;
  userId: string;
  targetUrl: string;
  jobType: string;
  taskDescription: string;
  callbackUrl: string;
}

/** Queue statistics */
export interface QueueStats {
  queued: number;
  active: number;
  completed: number;
  failed: number;
  all: number;
}

/** The general queue name. Workers subscribe to this. */
export const QUEUE_APPLY_JOB = "gh_apply_job";

/**
 * TaskQueueService — Enqueues GhostHands jobs via pg-boss.
 *
 * This replaces the HTTP REST dispatch path (GhostHandsClient.submitApplication)
 * with a shared Postgres-backed queue. VALET writes the gh_automation_jobs record
 * directly and enqueues a lightweight payload via pg-boss. GH workers consume
 * from the queue and execute the job.
 */
export class TaskQueueService {
  private pgBossService: PgBossService;
  private ghJobRepo: GhAutomationJobRepository;
  private logger: FastifyBaseLogger;

  constructor({
    pgBossService,
    ghJobRepo,
    logger,
  }: {
    pgBossService: PgBossService;
    ghJobRepo: GhAutomationJobRepository;
    logger: FastifyBaseLogger;
  }) {
    this.pgBossService = pgBossService;
    this.ghJobRepo = ghJobRepo;
    this.logger = logger;
  }

  /**
   * Fire-and-forget wake call to ATM. Ensures at least 1 GH worker is running
   * before enqueuing a task. Non-blocking — job enqueues immediately.
   */
  private wakeWorkers(): void {
    if (process.env.ATM_WAKE_ENABLED !== "true") return;
    const baseUrl = process.env.ATM_BASE_URL;
    const secret = process.env.ATM_DEPLOY_SECRET;
    if (!baseUrl || !secret) return;

    fetch(`${baseUrl}/fleet/wake`, {
      method: "POST",
      headers: {
        "X-Deploy-Secret": secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ count: 1 }),
      signal: AbortSignal.timeout(5_000),
    }).catch((err) => this.logger.warn({ err }, "ATM wake failed (non-fatal)"));
  }

  /**
   * Enqueue a job application task.
   * @returns The pg-boss job ID, or null if pg-boss is not available.
   */
  async enqueueApplyJob(
    payload: GhApplyJobPayload,
    options?: { targetWorkerId?: string; singletonKey?: string | null },
  ): Promise<string | null> {
    const boss = this.pgBossService.instance;
    if (!boss) {
      this.logger.warn("pg-boss not available — cannot enqueue job");
      return null;
    }

    // Route to specific worker via named queue, or use the general queue
    const queueName = options?.targetWorkerId
      ? `${QUEUE_APPLY_JOB}/${options.targetWorkerId}`
      : QUEUE_APPLY_JOB;

    // Ensure queue exists before sending. pg-boss requires queues to be created first.
    // TODO: Align GH PgBossConsumer.ts expiry from 1800s to 14400s (tracked for GH session)
    await boss.createQueue(queueName);

    // Fire-and-forget: ensure at least 1 GH worker is awake
    this.wakeWorkers();

    const singletonKey = options?.singletonKey ?? payload.valetTaskId;
    const jobId = await boss.send(queueName, payload, {
      retryLimit: 0, // EC10: No auto-retry — we handle retries ourselves
      expireInSeconds: 14400, // EC10: 4h expiry (was 30min; pg-boss cap varies by version)
      // EC5: Prevent duplicate dispatch — keyed on valetTaskId for true dedup
      ...(singletonKey ? { singletonKey } : {}),
    });

    this.logger.info(
      { pgBossJobId: jobId, ghJobId: payload.ghJobId, queue: queueName },
      "Enqueued apply job via pg-boss",
    );

    return jobId;
  }

  /**
   * Enqueue a generic task (e.g., test tasks).
   * @returns The pg-boss job ID, or null if pg-boss is not available.
   */
  async enqueueGenericTask(
    payload: GhGenericTaskPayload,
    options?: { targetWorkerId?: string; singletonKey?: string | null },
  ): Promise<string | null> {
    const boss = this.pgBossService.instance;
    if (!boss) {
      this.logger.warn("pg-boss not available — cannot enqueue task");
      return null;
    }

    const queueName = options?.targetWorkerId
      ? `${QUEUE_APPLY_JOB}/${options.targetWorkerId}`
      : QUEUE_APPLY_JOB;

    // Ensure queue exists before sending. pg-boss requires queues to be created first.
    // TODO: Align GH PgBossConsumer.ts expiry from 1800s to 14400s (tracked for GH session)
    await boss.createQueue(queueName);

    // Fire-and-forget: ensure at least 1 GH worker is awake
    this.wakeWorkers();

    const singletonKey = options?.singletonKey ?? payload.valetTaskId;
    const jobId = await boss.send(queueName, payload, {
      retryLimit: 0, // EC10: No auto-retry — we handle retries ourselves
      expireInSeconds: 14400, // EC10: 4h expiry (was 30min; pg-boss cap varies by version)
      // EC5: Prevent duplicate dispatch — keyed on valetTaskId for true dedup
      ...(singletonKey ? { singletonKey } : {}),
    });

    this.logger.info(
      { pgBossJobId: jobId, ghJobId: payload.ghJobId, queue: queueName },
      "Enqueued generic task via pg-boss",
    );

    return jobId;
  }

  /**
   * Cancel a pg-boss job if it hasn't been picked up yet.
   * @param pgBossJobId - The pg-boss job ID to cancel.
   * @param queueName - The queue the job was sent to. Defaults to the general queue.
   * @returns true if cancelled, false if already picked up or not found.
   */
  async cancelJob(pgBossJobId: string, queueName = QUEUE_APPLY_JOB): Promise<boolean> {
    const boss = this.pgBossService.instance;
    if (!boss) return false;

    try {
      await boss.cancel(queueName, pgBossJobId);
      this.logger.info({ pgBossJobId, queueName }, "Cancelled pg-boss job");
      return true;
    } catch (err) {
      this.logger.warn({ err, pgBossJobId, queueName }, "Failed to cancel pg-boss job");
      return false;
    }
  }

  /**
   * Get queue statistics for the main apply job queue.
   */
  async getQueueStats(): Promise<QueueStats | null> {
    const boss = this.pgBossService.instance;
    if (!boss) return null;

    try {
      const queue = await boss.getQueue(QUEUE_APPLY_JOB);
      if (!queue) {
        return { queued: 0, active: 0, completed: 0, failed: 0, all: 0 };
      }
      // TODO: pg-boss getQueue() only exposes queuedCount, activeCount, and totalCount.
      // Completed/failed counts are not available via this API. To get these, we would
      // need to query the pgboss.job table directly (e.g., SELECT count(*) WHERE state='completed').
      return {
        queued: queue.queuedCount,
        active: queue.activeCount,
        completed: 0,
        failed: 0,
        all: queue.totalCount,
      };
    } catch (err) {
      this.logger.warn({ err }, "Failed to get queue stats");
      return null;
    }
  }

  get isAvailable(): boolean {
    return this.pgBossService.isStarted;
  }
}
