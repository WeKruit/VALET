import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { TaskService } from "./task.service.js";
import type { TaskRepository } from "./task.repository.js";
import { publishToUser } from "../../websocket/handler.js";

const RECONCILIATION_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const STUCK_THRESHOLD_MINUTES = 30;
const TIMEOUT_THRESHOLD_MINUTES = 120;

export interface ReconciliationSummary {
  checked: number;
  reconciled: number;
  timedOut: number;
  skipped: number;
  errors: number;
}

export class StaleTaskReconciliationMonitor {
  private taskService: TaskService;
  private taskRepo: TaskRepository;
  private redis: Redis;
  private logger: FastifyBaseLogger;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor({
    taskService,
    taskRepo,
    redis,
    logger,
  }: {
    taskService: TaskService;
    taskRepo: TaskRepository;
    redis: Redis;
    logger: FastifyBaseLogger;
  }) {
    this.taskService = taskService;
    this.taskRepo = taskRepo;
    this.redis = redis;
    this.logger = logger;
  }

  start() {
    if (this.intervalId) return;
    this.logger.info(
      { intervalMs: RECONCILIATION_INTERVAL_MS },
      "Starting stale task reconciliation monitor",
    );
    this.reconcileStaleJobs();
    this.intervalId = setInterval(() => {
      this.reconcileStaleJobs();
    }, RECONCILIATION_INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info("Stale task reconciliation monitor stopped");
    }
  }

  async reconcileStaleJobs(): Promise<ReconciliationSummary> {
    if (this.running) {
      this.logger.debug("Reconciliation already running, skipping");
      return { checked: 0, reconciled: 0, timedOut: 0, skipped: 1, errors: 0 };
    }

    this.running = true;
    const summary: ReconciliationSummary = {
      checked: 0,
      reconciled: 0,
      timedOut: 0,
      skipped: 0,
      errors: 0,
    };

    try {
      const stuck = await this.taskService.findStuckJobs(STUCK_THRESHOLD_MINUTES);
      if (stuck.length === 0) {
        this.running = false;
        return summary;
      }

      this.logger.info({ count: stuck.length }, "Found stale tasks to reconcile");
      summary.checked = stuck.length;

      for (const task of stuck) {
        try {
          await this.reconcileTask(task, summary);
        } catch (err) {
          summary.errors++;
          this.logger.error({ err, taskId: task.id }, "Failed to reconcile individual task");
        }
      }

      this.logger.info(summary, "Stale task reconciliation complete");
    } catch (err) {
      this.logger.error({ err }, "Failed to run stale task reconciliation");
    } finally {
      this.running = false;
    }

    return summary;
  }

  private async reconcileTask(
    task: { id: string; userId: string; workflowRunId: string | null; updatedAt: Date },
    summary: ReconciliationSummary,
  ) {
    const stuckMinutes = (Date.now() - task.updatedAt.getTime()) / 60_000;

    if (!task.workflowRunId) {
      if (stuckMinutes >= TIMEOUT_THRESHOLD_MINUTES) {
        await this.markTimedOut(task, "No GhostHands job linked");
        summary.timedOut++;
      } else {
        summary.skipped++;
      }
      return;
    }

    const result = await this.taskService.syncGhJobStatus(task.id);

    if ("error" in result) {
      if (stuckMinutes >= TIMEOUT_THRESHOLD_MINUTES) {
        await this.markTimedOut(task, result.error as string);
        summary.timedOut++;
      } else {
        summary.skipped++;
        this.logger.debug(
          { taskId: task.id, stuckMinutes: Math.floor(stuckMinutes), error: result.error },
          "GH sync failed but under timeout threshold, will retry later",
        );
      }
      return;
    }

    if (result.taskUpdated || result.ghJobUpdated) {
      summary.reconciled++;
      this.logger.info(
        { taskId: task.id, from: result.previousTaskStatus, to: result.newTaskStatus },
        "Task reconciled with GH status",
      );
    } else {
      summary.skipped++;
    }
  }

  private async markTimedOut(
    task: { id: string; userId: string; workflowRunId: string | null },
    reason: string,
  ) {
    this.logger.warn(
      { taskId: task.id, reason },
      "Task exceeded reconciliation timeout, marking as failed",
    );
    const errorMessage = `Task stuck for over ${TIMEOUT_THRESHOLD_MINUTES} minutes. ${reason}`;

    await this.taskRepo.updateStatus(task.id, "failed");
    await this.taskRepo.updateGhosthandsResult(task.id, {
      ghJobId: task.workflowRunId ?? "",
      result: null,
      error: {
        code: "reconciliation_timeout",
        message: errorMessage,
      },
      completedAt: null,
    });

    // Notify the frontend via WebSocket so the UI updates in real-time
    await publishToUser(this.redis, task.userId, {
      type: "task_update",
      taskId: task.id,
      status: "failed",
      currentStep: `Failed: ${errorMessage}`,
      error: { code: "reconciliation_timeout", message: errorMessage },
    });
  }
}
