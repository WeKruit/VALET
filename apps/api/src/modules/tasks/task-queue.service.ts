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
   * Enqueue a job application task.
   * @returns The pg-boss job ID, or null if pg-boss is not available.
   */
  async enqueueApplyJob(
    payload: GhApplyJobPayload,
    options?: { targetWorkerId?: string },
  ): Promise<string | null> {
    const boss = this.pgBossService.instance;
    if (!boss) {
      this.logger.warn("pg-boss not available — cannot enqueue job");
      return null;
    }

    // Route to specific worker via named queue, or use the general queue
    const queueName = options?.targetWorkerId
      ? `${QUEUE_APPLY_JOB}:${options.targetWorkerId}`
      : QUEUE_APPLY_JOB;

    const jobId = await boss.send(queueName, payload, {
      retryLimit: 3,
      retryBackoff: true,
      retryDelay: 15,
      expireInSeconds: 30 * 60,
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
    options?: { targetWorkerId?: string },
  ): Promise<string | null> {
    const boss = this.pgBossService.instance;
    if (!boss) {
      this.logger.warn("pg-boss not available — cannot enqueue task");
      return null;
    }

    const queueName = options?.targetWorkerId
      ? `${QUEUE_APPLY_JOB}:${options.targetWorkerId}`
      : QUEUE_APPLY_JOB;

    const jobId = await boss.send(queueName, payload, {
      retryLimit: 3,
      retryBackoff: true,
      retryDelay: 15,
      expireInSeconds: 30 * 60,
    });

    this.logger.info(
      { pgBossJobId: jobId, ghJobId: payload.ghJobId, queue: queueName },
      "Enqueued generic task via pg-boss",
    );

    return jobId;
  }

  /**
   * Cancel a pg-boss job if it hasn't been picked up yet.
   * @returns true if cancelled, false if already picked up or not found.
   */
  async cancelJob(pgBossJobId: string): Promise<boolean> {
    const boss = this.pgBossService.instance;
    if (!boss) return false;

    try {
      await boss.cancel(QUEUE_APPLY_JOB, pgBossJobId);
      this.logger.info({ pgBossJobId }, "Cancelled pg-boss job");
      return true;
    } catch (err) {
      this.logger.warn({ err, pgBossJobId }, "Failed to cancel pg-boss job");
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
