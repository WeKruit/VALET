import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type {
  ApplicationMode,
  ExternalStatus,
  TaskStatus,
  InteractionType,
} from "@valet/shared/schemas";
import type { TaskRepository } from "./task.repository.js";
import type { ResumeRepository } from "../resumes/resume.repository.js";
import type { QaBankRepository } from "../qa-bank/qa-bank.repository.js";
import type { GhostHandsClient } from "../ghosthands/ghosthands.client.js";
import type { GHProfile, GHEducation, GHWorkHistory } from "../ghosthands/ghosthands.types.js";
import type { GhAutomationJobRepository } from "../ghosthands/gh-automation-job.repository.js";
import type { GhBrowserSessionRepository } from "../ghosthands/gh-browser-session.repository.js";
import { QUEUE_APPLY_JOB, type TaskQueueService } from "./task-queue.service.js";
import type { GhJobEventRepository } from "../ghosthands/gh-job-event.repository.js";
import {
  TaskNotFoundError,
  TaskNotCancellableError,
  TaskNotResolvableError,
} from "./task.errors.js";
import { publishToUser } from "../../websocket/handler.js";

function useQueueDispatch(): boolean {
  return process.env.TASK_DISPATCH_MODE === "queue";
}

const CANCELLABLE_STATUSES = new Set(["created", "queued", "in_progress", "waiting_human"]);

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCallbackUrl(): string {
  const base =
    process.env.GHOSTHANDS_CALLBACK_URL ??
    `${process.env.API_URL ?? "http://localhost:8000"}/api/v1/webhooks/ghosthands`;
  // Append service token so GH's callbackNotifier passes auth
  const token = process.env.GH_SERVICE_SECRET;
  if (!token) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}token=${token}`;
}

export class TaskService {
  private taskRepo: TaskRepository;
  private resumeRepo: ResumeRepository;
  private qaBankRepo: QaBankRepository;
  private ghosthandsClient: GhostHandsClient;
  private ghJobRepo: GhAutomationJobRepository;
  private ghJobEventRepo: GhJobEventRepository;
  private ghSessionRepo: GhBrowserSessionRepository;
  private taskQueueService: TaskQueueService;
  private redis: Redis;
  private logger: FastifyBaseLogger;

  constructor({
    taskRepo,
    resumeRepo,
    qaBankRepo,
    ghosthandsClient,
    ghJobRepo,
    ghJobEventRepo,
    ghSessionRepo,
    taskQueueService,
    redis,
    logger,
  }: {
    taskRepo: TaskRepository;
    resumeRepo: ResumeRepository;
    qaBankRepo: QaBankRepository;
    ghosthandsClient: GhostHandsClient;
    ghJobRepo: GhAutomationJobRepository;
    ghJobEventRepo: GhJobEventRepository;
    ghSessionRepo: GhBrowserSessionRepository;
    taskQueueService: TaskQueueService;
    redis: Redis;
    logger: FastifyBaseLogger;
  }) {
    this.taskRepo = taskRepo;
    this.resumeRepo = resumeRepo;
    this.qaBankRepo = qaBankRepo;
    this.ghosthandsClient = ghosthandsClient;
    this.ghJobRepo = ghJobRepo;
    this.ghJobEventRepo = ghJobEventRepo;
    this.ghSessionRepo = ghSessionRepo;
    this.taskQueueService = taskQueueService;
    this.redis = redis;
    this.logger = logger;
  }

  async getById(id: string, userId: string) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    // Build interaction object from DB fields
    const VALID_INTERACTION_TYPES: readonly InteractionType[] = [
      "captcha",
      "two_factor",
      "login_required",
      "bot_check",
      "rate_limited",
      "verification",
    ];
    const rawType = task.interactionType;
    const interaction =
      rawType &&
      VALID_INTERACTION_TYPES.includes(rawType as InteractionType) &&
      task.interactionData
        ? {
            type: rawType as InteractionType,
            screenshotUrl: ((task.interactionData.screenshot_url as string) ?? null) as
              | string
              | null
              | undefined,
            pageUrl: ((task.interactionData.page_url as string) ?? null) as
              | string
              | null
              | undefined,
            timeoutSeconds: ((task.interactionData.timeout_seconds as number) ?? null) as
              | number
              | null
              | undefined,
            message: ((task.interactionData.message as string) ?? null) as
              | string
              | null
              | undefined,
            description: ((task.interactionData.description as string) ?? null) as
              | string
              | null
              | undefined,
            metadata:
              (task.interactionData.metadata as {
                blocker_confidence?: number;
                captcha_type?: string;
                detection_method?: string;
              }) ?? null,
            pausedAt: new Date((task.interactionData.paused_at as string) ?? Date.now()),
          }
        : (null as null);

    // Enrich with GhostHands job data if a GH job exists (self-healing reconciliation)
    const ghJob = await this.fetchGhJobData(task.workflowRunId, task.status as TaskStatus);

    // WEK-71: Compute progress from gh_job_events (single source of truth)
    // instead of relying on the stale tasks.progress column
    const liveProgress = await this.computeProgressFromEvents(task.workflowRunId);
    const enrichedTask = { ...task };
    if (liveProgress) {
      enrichedTask.progress = liveProgress.progress;
      enrichedTask.currentStep = liveProgress.currentStep;
    }

    return { ...enrichedTask, interaction, ghJob };
  }

  private async fetchGhJobData(workflowRunId: string | null, taskStatus?: TaskStatus) {
    if (!workflowRunId) return null;

    const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
    const GH_NON_TERMINAL = new Set(["pending", "queued", "running", "needs_human"]);

    // Map task status -> gh_automation_jobs status for reverse sync
    const taskToGhStatus: Partial<Record<TaskStatus, string>> = {
      completed: "completed",
      failed: "failed",
      cancelled: "cancelled",
    };

    // Try local DB first (synced by webhook handler)
    try {
      const job = await this.ghJobRepo.findById(workflowRunId);
      if (job) {
        // Self-healing: if task is terminal but GH job is not, fix the GH job
        if (taskStatus && TERMINAL_STATUSES.has(taskStatus) && GH_NON_TERMINAL.has(job.status)) {
          const correctedGhStatus = taskToGhStatus[taskStatus];
          if (correctedGhStatus) {
            this.logger.warn(
              {
                workflowRunId,
                taskStatus,
                ghJobStatus: job.status,
                correctedGhStatus,
              },
              "Reconciling divergent gh_automation_jobs status to match terminal task",
            );
            await this.ghJobRepo.updateStatus(workflowRunId, {
              status: correctedGhStatus,
              statusMessage: `Reconciled: task was ${taskStatus}`,
              completedAt: new Date(),
            });
            job.status = correctedGhStatus;
          }
        }

        return {
          jobId: job.id,
          ghStatus: job.status,
          executionMode: job.executionMode ?? null,
          progress: null as number | null,
          statusMessage: job.statusMessage ?? null,
          result: job.resultData ? { ...job.resultData } : null,
          error: job.errorCode
            ? {
                code: job.errorCode,
                message:
                  ((job.errorDetails as Record<string, unknown>)?.message as string) ??
                  "Unknown error",
              }
            : null,
          cost:
            job.llmCostCents != null
              ? {
                  totalCostUsd: (job.llmCostCents ?? 0) / 100,
                  actionCount: job.actionCount ?? 0,
                  totalTokens: job.totalTokens ?? 0,
                }
              : null,
          timestamps: {
            createdAt: job.createdAt.toISOString(),
            startedAt: job.startedAt?.toISOString() ?? null,
            completedAt: job.completedAt?.toISOString() ?? null,
          },
          targetWorkerId: job.targetWorkerId ?? null,
        };
      }
    } catch (err) {
      this.logger.debug({ err, workflowRunId }, "Failed to read GH job from local DB");
    }

    // Fallback to GH API if not in local DB
    try {
      const ghStatus = await this.ghosthandsClient.getJobStatus(workflowRunId);
      const raw = ghStatus as unknown as Record<string, unknown>;
      const rawCost = raw.cost as Record<string, number> | undefined;
      return {
        jobId: ghStatus.job_id,
        ghStatus: ghStatus.status,
        executionMode: (raw.execution_mode as string) ?? null,
        progress: ghStatus.progress ?? null,
        statusMessage: ghStatus.status_message ?? null,
        result: ghStatus.result ? { ...ghStatus.result } : null,
        error: ghStatus.error
          ? { code: ghStatus.error.code, message: ghStatus.error.message }
          : null,
        cost: rawCost
          ? {
              totalCostUsd: rawCost.total_cost_usd ?? 0,
              actionCount: rawCost.action_count ?? 0,
              totalTokens: rawCost.total_tokens ?? 0,
            }
          : null,
        timestamps: {
          createdAt: ghStatus.timestamps.created_at,
          startedAt: ghStatus.timestamps.started_at ?? null,
          completedAt: ghStatus.timestamps.completed_at ?? null,
        },
        targetWorkerId: ghStatus.target_worker_id ?? null,
      };
    } catch (err) {
      this.logger.debug({ err, workflowRunId }, "Failed to fetch GH job status (non-critical)");
      return null;
    }
  }

  /**
   * WEK-71: Compute current progress from gh_job_events instead of the stale
   * tasks.progress column. gh_job_events is the single source of truth for
   * progress data, written by GH ProgressTracker every ~2 seconds.
   *
   * Returns null if no progress events exist (task hasn't started yet).
   */
  private async computeProgressFromEvents(
    workflowRunId: string | null,
  ): Promise<{ progress: number; currentStep: string } | null> {
    if (!workflowRunId) return null;

    try {
      const latestEvent = await this.ghJobEventRepo.findLatestProgressEvent(workflowRunId);
      if (!latestEvent?.metadata) return null;

      const meta = latestEvent.metadata as {
        progress_pct?: number;
        description?: string;
        step?: string;
      };

      return {
        progress: Math.round(meta.progress_pct ?? 0),
        currentStep: meta.description ?? meta.step ?? "Processing",
      };
    } catch (err) {
      this.logger.debug(
        { err, workflowRunId },
        "Failed to compute progress from gh_job_events (non-critical)",
      );
      return null;
    }
  }

  async list(
    userId: string,
    query: {
      page: number;
      pageSize: number;
      status?: string;
      platform?: string;
      search?: string;
      sortBy: string;
      sortOrder: string;
    },
  ) {
    const { data, total } = await this.taskRepo.findMany(userId, query);
    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async exportCsv(userId: string): Promise<string> {
    const allTasks = await this.taskRepo.findAllForExport(userId);

    const headers = [
      "Date",
      "Job Title",
      "Company",
      "Platform",
      "Status",
      "External Status",
      "URL",
    ];
    const rows = allTasks.map((t) => [
      t.createdAt.toISOString().split("T")[0] ?? "",
      csvEscape(t.jobTitle ?? ""),
      csvEscape(t.companyName ?? ""),
      t.platform,
      t.status,
      t.externalStatus ?? "",
      csvEscape(t.jobUrl),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }

  async updateExternalStatus(id: string, userId: string, externalStatus: ExternalStatus | null) {
    const task = await this.taskRepo.updateExternalStatus(id, userId, externalStatus);
    if (!task) throw new TaskNotFoundError(id);
    return task;
  }

  async create(
    body: {
      jobUrl: string;
      mode: ApplicationMode;
      resumeId: string;
      notes?: string;
      targetWorkerId?: string;
    },
    userId: string,
  ) {
    // Tag notes with sandbox ID for tracking
    const notes = body.targetWorkerId
      ? `${body.notes ?? ""} [sandbox:${body.targetWorkerId}]`.trim()
      : body.notes;

    const task = await this.taskRepo.create({
      userId,
      jobUrl: body.jobUrl,
      mode: body.mode,
      resumeId: body.resumeId,
      notes,
      sandboxId: body.targetWorkerId,
    });

    // Fetch resume data for the GhostHands profile
    const resume = await this.resumeRepo.findById(body.resumeId, userId);
    if (!resume) {
      this.logger.warn({ resumeId: body.resumeId }, "Resume not found for task creation");
    }

    // Build profile from parsed resume data
    const profile = this.buildGhosthandsProfile(
      resume?.parsedData as Record<string, unknown> | null,
    );

    // Fetch QA bank answers for the user
    const qaEntries = await this.qaBankRepo.findByUserId(userId);
    const qaAnswers: Record<string, string> = {};
    for (const entry of qaEntries) {
      if (entry.usageMode === "always_use") {
        qaAnswers[entry.question] = entry.answer;
      }
    }

    const callbackUrl = buildCallbackUrl();

    if (useQueueDispatch() && this.taskQueueService.isAvailable) {
      // ── Queue dispatch path (pg-boss) ──
      try {
        const ghJob = await this.ghJobRepo.insertPendingJob({
          userId,
          jobType: "apply",
          targetUrl: task.jobUrl,
          inputData: {
            user_data: profile,
            qa_overrides: Object.keys(qaAnswers).length > 0 ? qaAnswers : {},
            tier: body.mode === "autopilot" ? "free" : "starter",
            platform: task.platform,
            resume_ref: { storage_path: resume?.fileKey ?? "" },
          },
          priority: 5,
          maxRetries: 1,
          tags: ["valet", "apply"],
          metadata: {
            quality_preset: body.mode === "autopilot" ? "speed" : "quality",
          },
          targetWorkerId: body.targetWorkerId,
          callbackUrl,
          valetTaskId: task.id,
          workerAffinity: body.targetWorkerId ? "strict" : undefined,
        });

        const pgBossJobId = await this.taskQueueService.enqueueApplyJob(
          {
            ghJobId: ghJob.id,
            valetTaskId: task.id,
            userId,
            targetUrl: task.jobUrl,
            platform: task.platform,
            jobType: "apply",
            callbackUrl,
          },
          { targetWorkerId: body.targetWorkerId },
        );

        // Store pg-boss job ID and queue name in gh_automation_jobs metadata for cancellation
        const pgBossQueueName = body.targetWorkerId
          ? `${QUEUE_APPLY_JOB}/${body.targetWorkerId}`
          : QUEUE_APPLY_JOB;
        if (pgBossJobId) {
          await this.ghJobRepo.updateStatus(ghJob.id, {
            status: "queued",
            metadata: {
              ...(ghJob.metadata ?? {}),
              pgBossJobId,
              pgBossQueueName,
            },
          });
        }

        await this.taskRepo.updateWorkflowRunId(task.id, ghJob.id);
        await this.taskRepo.updateStatus(task.id, "queued");

        await publishToUser(this.redis, userId, {
          type: "task_update",
          taskId: task.id,
          status: "queued",
        });
      } catch (err) {
        this.logger.error({ err, taskId: task.id }, "Failed to enqueue job via pg-boss");
        await this.taskRepo.updateStatus(task.id, "failed");
        await this.taskRepo.updateGhosthandsResult(task.id, {
          ghJobId: "",
          result: null,
          error: {
            code: "GH_QUEUE_FAILED",
            message: err instanceof Error ? err.message : "Failed to enqueue job",
          },
          completedAt: null,
        });
      }
    } else {
      // ── REST dispatch path (legacy) ──
      try {
        const ghResponse = await this.ghosthandsClient.submitApplication({
          valet_task_id: task.id,
          valet_user_id: userId,
          target_url: task.jobUrl,
          platform: task.platform,
          resume: {
            storage_path: resume?.fileKey ?? "",
          },
          profile,
          qa_answers: Object.keys(qaAnswers).length > 0 ? qaAnswers : undefined,
          callback_url: callbackUrl,
          quality: body.mode === "autopilot" ? "speed" : "quality",
          max_retries: 1,
          ...(body.targetWorkerId
            ? { target_worker_id: body.targetWorkerId, worker_affinity: "strict" as const }
            : {}),
        });

        await this.taskRepo.updateWorkflowRunId(task.id, ghResponse.job_id);
        await this.taskRepo.updateStatus(task.id, "queued");

        await publishToUser(this.redis, userId, {
          type: "task_update",
          taskId: task.id,
          status: "queued",
        });
      } catch (err) {
        this.logger.error({ err, taskId: task.id }, "Failed to submit application to GhostHands");
        await this.taskRepo.updateStatus(task.id, "failed");
        await this.taskRepo.updateGhosthandsResult(task.id, {
          ghJobId: "",
          result: null,
          error: {
            code: "GH_SUBMIT_FAILED",
            message: err instanceof Error ? err.message : "Failed to submit to GhostHands",
          },
          completedAt: null,
        });
      }
    }

    return task;
  }

  private buildGhosthandsProfile(parsedData: Record<string, unknown> | null): GHProfile {
    if (!parsedData) {
      return { first_name: "", last_name: "", email: "" };
    }

    const fullName = (parsedData.fullName as string) ?? "";
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const education: GHEducation[] = [];
    if (Array.isArray(parsedData.education)) {
      for (const edu of parsedData.education as Record<string, unknown>[]) {
        education.push({
          institution: (edu.school as string) ?? "",
          degree: (edu.degree as string) ?? "",
          field: (edu.fieldOfStudy as string) ?? "",
          graduation_year: edu.endDate ? parseInt(String(edu.endDate).slice(0, 4), 10) || 0 : 0,
        });
      }
    }

    const workHistory: GHWorkHistory[] = [];
    if (Array.isArray(parsedData.workHistory)) {
      for (const work of parsedData.workHistory as Record<string, unknown>[]) {
        workHistory.push({
          company: (work.company as string) ?? "",
          title: (work.title as string) ?? "",
          start_date: (work.startDate as string) ?? "",
          end_date: (work.endDate as string) ?? undefined,
          description: (work.description as string) ?? undefined,
        });
      }
    }

    const websites: string[] = [];
    if (Array.isArray(parsedData.websites)) {
      for (const url of parsedData.websites as string[]) {
        if (typeof url === "string") websites.push(url);
      }
    }

    const linkedinUrl = websites.find((u) => u.includes("linkedin.com"));
    const portfolioUrl = websites.find((u) => !u.includes("linkedin.com"));

    return {
      first_name: firstName,
      last_name: lastName,
      email: (parsedData.email as string) ?? "",
      phone: (parsedData.phone as string) ?? undefined,
      linkedin_url: linkedinUrl,
      portfolio_url: portfolioUrl,
      work_authorization: (parsedData.workAuthorization as string) ?? undefined,
      years_of_experience: (parsedData.totalYearsExperience as number) ?? undefined,
      education: education.length > 0 ? education : undefined,
      work_history: workHistory.length > 0 ? workHistory : undefined,
      skills: Array.isArray(parsedData.skills) ? (parsedData.skills as string[]) : undefined,
    };
  }

  async createTestTask(body: { searchQuery: string; targetWorkerId: string }, userId: string) {
    // Create a task record for tracking the test
    const task = await this.taskRepo.create({
      userId,
      jobUrl: "https://www.google.com",
      mode: "autopilot",
      resumeId: "", // no resume needed for test
      notes: `Integration test: "${body.searchQuery}" [sandbox:${body.targetWorkerId}]`,
      sandboxId: body.targetWorkerId,
    });

    const callbackUrl = buildCallbackUrl();
    const taskDescription = `Google search integration test: ${body.searchQuery}`;

    if (useQueueDispatch() && this.taskQueueService.isAvailable) {
      // ── Queue dispatch path (pg-boss) ──
      try {
        const ghJob = await this.ghJobRepo.insertPendingJob({
          userId,
          jobType: "custom",
          targetUrl: "https://www.google.com",
          taskDescription,
          inputData: { platform: "google", tier: "free" },
          maxRetries: 1,
          tags: ["valet", "test"],
          targetWorkerId: body.targetWorkerId,
          callbackUrl,
          valetTaskId: task.id,
          workerAffinity: "strict",
        });

        const pgBossJobId = await this.taskQueueService.enqueueGenericTask(
          {
            ghJobId: ghJob.id,
            valetTaskId: task.id,
            userId,
            targetUrl: "https://www.google.com",
            jobType: "custom",
            taskDescription,
            callbackUrl,
          },
          { targetWorkerId: body.targetWorkerId },
        );

        // Store pg-boss job ID and queue name in gh_automation_jobs metadata for cancellation
        const pgBossQueueName = body.targetWorkerId
          ? `${QUEUE_APPLY_JOB}/${body.targetWorkerId}`
          : QUEUE_APPLY_JOB;
        if (pgBossJobId) {
          await this.ghJobRepo.updateStatus(ghJob.id, {
            status: "queued",
            metadata: {
              ...(ghJob.metadata ?? {}),
              pgBossJobId,
              pgBossQueueName,
            },
          });
        }

        await this.taskRepo.updateWorkflowRunId(task.id, ghJob.id);
        await this.taskRepo.updateStatus(task.id, "queued");

        await publishToUser(this.redis, userId, {
          type: "task_update",
          taskId: task.id,
          status: "queued",
        });
      } catch (err) {
        this.logger.error({ err, taskId: task.id }, "Failed to enqueue test task via pg-boss");
        await this.taskRepo.updateStatus(task.id, "failed");
        await this.taskRepo.updateGhosthandsResult(task.id, {
          ghJobId: "",
          result: null,
          error: {
            code: "GH_QUEUE_FAILED",
            message: err instanceof Error ? err.message : "Failed to enqueue test task",
          },
          completedAt: null,
        });
      }
    } else {
      // ── REST dispatch path (legacy) ──
      try {
        const ghResponse = await this.ghosthandsClient.submitGenericTask({
          valet_task_id: task.id,
          valet_user_id: userId,
          job_type: "custom",
          target_url: "https://www.google.com",
          task_description: taskDescription,
          callback_url: callbackUrl,
          max_retries: 1,
          target_worker_id: body.targetWorkerId,
          worker_affinity: "strict",
        });

        await this.taskRepo.updateWorkflowRunId(task.id, ghResponse.job_id);
        await this.taskRepo.updateStatus(task.id, "queued");

        await publishToUser(this.redis, userId, {
          type: "task_update",
          taskId: task.id,
          status: "queued",
        });
      } catch (err) {
        this.logger.error({ err, taskId: task.id }, "Failed to submit test task to GhostHands");
        await this.taskRepo.updateStatus(task.id, "failed");
        await this.taskRepo.updateGhosthandsResult(task.id, {
          ghJobId: "",
          result: null,
          error: {
            code: "GH_SUBMIT_FAILED",
            message: err instanceof Error ? err.message : "Failed to submit test to GhostHands",
          },
          completedAt: null,
        });
      }
    }

    return task;
  }

  async retry(id: string, userId: string) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    if (task.status !== "failed") {
      throw new TaskNotCancellableError(id, task.status);
    }

    if (!task.workflowRunId) {
      throw new TaskNotResolvableError(id, "no GhostHands job to retry");
    }

    this.logger.info({ taskId: id, jobId: task.workflowRunId }, "Retrying GhostHands job");

    if (useQueueDispatch() && this.taskQueueService.isAvailable) {
      // Queue mode: create new gh_automation_jobs record + enqueue via pg-boss
      // Fetch original job to copy inputData (profile, QA answers, resume ref, platform, tier)
      const originalGhJob = await this.ghJobRepo.findById(task.workflowRunId);
      if (!originalGhJob) {
        throw new TaskNotResolvableError(id, "original GhostHands job not found for retry");
      }

      const callbackUrl = buildCallbackUrl();
      const ghJob = await this.ghJobRepo.insertPendingJob({
        userId,
        jobType: originalGhJob.jobType ?? "apply",
        targetUrl: task.jobUrl,
        taskDescription: `Retry of task ${id}`,
        inputData: originalGhJob.inputData ?? {},
        priority: 5,
        maxRetries: 3,
        timeoutSeconds: 1800,
        tags: ["retry", "valet"],
        valetTaskId: id,
        callbackUrl,
        targetWorkerId: originalGhJob.targetWorkerId ?? undefined,
        workerAffinity: originalGhJob.targetWorkerId ? "strict" : undefined,
        metadata: {
          retryOf: task.workflowRunId,
          quality_preset: originalGhJob.metadata?.quality_preset ?? "quality",
        },
      });

      const targetWorkerId = task.sandboxId || undefined;
      const pgBossJobId = await this.taskQueueService.enqueueApplyJob(
        {
          ghJobId: ghJob.id,
          valetTaskId: id,
          userId,
          targetUrl: task.jobUrl,
          platform: task.platform || "other",
          jobType: "apply",
          callbackUrl,
        },
        { targetWorkerId },
      );

      // Store pg-boss job ID and queue name in gh_automation_jobs metadata for cancellation
      const pgBossQueueName = targetWorkerId
        ? `${QUEUE_APPLY_JOB}/${targetWorkerId}`
        : QUEUE_APPLY_JOB;
      if (pgBossJobId) {
        await this.ghJobRepo.updateStatus(ghJob.id, {
          status: "queued",
          metadata: {
            ...(((ghJob as unknown as Record<string, unknown>).metadata as Record<
              string,
              unknown
            >) ?? {}),
            pgBossJobId,
            pgBossQueueName,
          },
        });
      }

      // Update task to point to the new job
      await this.taskRepo.updateWorkflowRunId(id, ghJob.id);
    } else {
      // Legacy REST mode
      try {
        await this.ghosthandsClient.retryJob(task.workflowRunId);
      } catch (err) {
        this.logger.error({ err, taskId: id }, "Failed to retry GhostHands job");
        throw err;
      }
    }

    await this.taskRepo.updateStatus(id, "queued");
    // WEK-71: No longer write progress to tasks table. GH events are the source of truth.

    await publishToUser(this.redis, userId, {
      type: "task_update",
      taskId: id,
      status: "queued",
    });

    const updated = await this.taskRepo.findById(id, userId);
    if (!updated) throw new TaskNotFoundError(id);
    return updated;
  }

  async cancel(id: string, userId: string) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    if (!CANCELLABLE_STATUSES.has(task.status)) {
      throw new TaskNotCancellableError(id, task.status);
    }

    await this.taskRepo.cancel(id);

    // Cancel the GhostHands job if one exists
    if (task.workflowRunId) {
      // In queue mode, cancel pg-boss job and mark the gh_automation_jobs record as cancelled
      if (useQueueDispatch() && this.taskQueueService.isAvailable) {
        try {
          // Read GH job metadata for pg-boss job ID and queue name
          const ghJob = await this.ghJobRepo.findById(task.workflowRunId);
          const pgBossJobId = ghJob?.metadata?.pgBossJobId as string | undefined;
          const pgBossQueueName = ghJob?.metadata?.pgBossQueueName as string | undefined;

          if (pgBossJobId) {
            await this.taskQueueService.cancelJob(pgBossJobId, pgBossQueueName);
          }

          await this.ghJobRepo.updateStatus(task.workflowRunId, {
            status: "cancelled",
            completedAt: new Date(),
            statusMessage: "Cancelled by user via VALET",
          });
        } catch (err) {
          this.logger.warn(
            { err, taskId: id, jobId: task.workflowRunId },
            "Failed to cancel gh_automation_jobs record",
          );
        }
      }

      // Also try REST cancel for in-flight jobs (needed if worker is already executing)
      try {
        await this.ghosthandsClient.cancelJob(task.workflowRunId);
      } catch (err) {
        this.logger.warn(
          { err, taskId: id, jobId: task.workflowRunId },
          "Failed to cancel GhostHands job (may have already completed)",
        );
      }
    }
  }

  /**
   * Get pg-boss queue statistics.
   * Returns stats if pg-boss is available, otherwise a zeroed-out response.
   */
  async getQueueStats() {
    if (!this.taskQueueService.isAvailable) {
      return { available: false, queued: 0, active: 0, completed: 0, failed: 0, all: 0 };
    }
    const stats = await this.taskQueueService.getQueueStats();
    if (!stats) {
      return { available: false, queued: 0, active: 0, completed: 0, failed: 0, all: 0 };
    }
    return { available: true, ...stats };
  }

  async approve(id: string, userId: string, fieldOverrides?: Record<string, string>) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    this.logger.info({ taskId: id, fieldOverrides }, "Task approved, resuming GhostHands job");

    if (task.workflowRunId) {
      try {
        await this.ghosthandsClient.resumeJob(task.workflowRunId, {
          resolved_by: "human",
          notes: fieldOverrides ? `Field overrides: ${JSON.stringify(fieldOverrides)}` : undefined,
        });
      } catch (err) {
        this.logger.warn(
          { err, taskId: id, jobId: task.workflowRunId },
          "Failed to resume GhostHands job after approval",
        );
      }
    }

    await this.taskRepo.updateStatus(id, "in_progress");
    const updated = await this.taskRepo.findById(id, userId);
    if (!updated) throw new TaskNotFoundError(id);
    return updated;
  }

  async stats(userId: string) {
    return this.taskRepo.getStats(userId);
  }

  async captchaSolved(id: string, userId: string) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    this.logger.info({ taskId: id }, "Captcha solved, resuming GhostHands job");

    if (task.workflowRunId) {
      try {
        await this.ghosthandsClient.resumeJob(task.workflowRunId, {
          resolved_by: "human",
          notes: "CAPTCHA manually solved by user",
        });
      } catch (err) {
        this.logger.warn(
          { err, taskId: id, jobId: task.workflowRunId },
          "Failed to resume GhostHands job after CAPTCHA solve",
        );
      }
    }

    await this.taskRepo.updateStatus(id, "in_progress");
  }

  async resolveBlocker(
    taskId: string,
    userId: string,
    resolvedBy?: string,
    notes?: string,
    resolutionType?: string,
    resolutionData?: Record<string, unknown>,
  ) {
    const task = await this.taskRepo.findById(taskId, userId);
    if (!task) throw new TaskNotFoundError(taskId);

    if (task.status !== "waiting_human") {
      throw new TaskNotResolvableError(taskId, task.status);
    }

    if (!task.workflowRunId) {
      throw new TaskNotResolvableError(taskId, "no workflowRunId");
    }

    await this.ghosthandsClient.resumeJob(task.workflowRunId, {
      resolved_by: resolvedBy,
      notes,
      resolution_type: resolutionType,
      resolution_data: resolutionData,
    });

    // Do NOT update task status here — wait for GH resumed callback
    return {
      taskId,
      status: "waiting_human" as const,
      message: "Resume request sent to GhostHands",
    };
  }

  async listSessions(userId: string) {
    // Read from local gh_browser_sessions table (no GH API dependency)
    try {
      const sessions = await this.ghSessionRepo.findByUserId(userId);
      return {
        sessions: sessions.map((s) => ({
          id: s.id,
          user_id: s.userId ?? userId,
          domain: s.domain ?? "",
          created_at: s.createdAt.toISOString(),
          last_used_at: s.lastUsedAt?.toISOString() ?? null,
          expires_at: s.expiresAt?.toISOString() ?? undefined,
        })),
        total: sessions.length,
      };
    } catch (err) {
      this.logger.warn({ err }, "Failed to read sessions from local DB, trying GH API");
    }

    // Fallback to GH API
    try {
      return await this.ghosthandsClient.listSessions(userId);
    } catch {
      return { sessions: [], total: 0 };
    }
  }

  async clearSession(userId: string, domain: string) {
    // Clear locally first, then try GH API
    try {
      await this.ghSessionRepo.deleteByUserAndDomain(userId, domain);
    } catch (err) {
      this.logger.warn({ err }, "Failed to delete session from local DB");
    }
    try {
      return await this.ghosthandsClient.clearSession(userId, domain);
    } catch {
      return { deleted: true, session_id: "" };
    }
  }

  async clearAllSessions(userId: string) {
    // Clear locally first, then try GH API
    try {
      await this.ghSessionRepo.deleteAllByUser(userId);
    } catch (err) {
      this.logger.warn({ err }, "Failed to delete sessions from local DB");
    }
    try {
      return await this.ghosthandsClient.clearAllSessions(userId);
    } catch {
      return { deleted_count: 0, user_id: userId };
    }
  }

  /**
   * Find stuck jobs (queued/in_progress for too long) and optionally sync their status
   * with GhostHands. Admin-only operation.
   */
  async findStuckJobs(stuckMinutes = 30) {
    const stuck = await this.taskRepo.findStuckJobs(stuckMinutes);

    // For each stuck job with a workflowRunId, check GH status
    const enriched = await Promise.all(
      stuck.map(async (task) => {
        const ghJob = await this.fetchGhJobData(task.workflowRunId, task.status as TaskStatus);
        return { ...task, ghJob };
      }),
    );

    return enriched;
  }

  /**
   * Force-sync a single task's status with GhostHands API. Admin-only operation.
   * Pulls latest from GH API and syncs BOTH the tasks table and gh_automation_jobs table.
   */
  async syncGhJobStatus(taskId: string) {
    const task = await this.taskRepo.findByIdAdmin(taskId);
    if (!task) return { taskId, error: "Task not found" };
    if (!task.workflowRunId) return { taskId, error: "No GhostHands job linked" };

    // GH status -> task status mapping
    const ghToTaskStatus: Record<string, TaskStatus> = {
      running: "in_progress",
      completed: "completed",
      failed: "failed",
      cancelled: "cancelled",
      needs_human: "waiting_human",
    };

    try {
      const ghApiStatus = await this.ghosthandsClient.getJobStatus(task.workflowRunId);
      const mappedTaskStatus = ghToTaskStatus[ghApiStatus.status];

      let taskUpdated = false;
      const previousTaskStatus = task.status;

      // 1. Sync tasks table: if GH status maps to a different task status, update
      if (mappedTaskStatus && mappedTaskStatus !== task.status) {
        this.logger.info(
          {
            taskId,
            fromStatus: task.status,
            toStatus: mappedTaskStatus,
            ghStatus: ghApiStatus.status,
          },
          "Syncing task status from GhostHands API",
        );
        await this.taskRepo.updateStatus(taskId, mappedTaskStatus);
        taskUpdated = true;

        if (ghApiStatus.result || ghApiStatus.error) {
          await this.taskRepo.updateGhosthandsResult(taskId, {
            ghJobId: ghApiStatus.job_id,
            result: ghApiStatus.result ? { ...ghApiStatus.result } : null,
            error: ghApiStatus.error
              ? { code: ghApiStatus.error.code, message: ghApiStatus.error.message }
              : null,
            completedAt: ghApiStatus.timestamps.completed_at ?? null,
          });
        }
      }

      // 2. Sync gh_automation_jobs table
      let ghJobUpdated = false;
      const ghJob = await this.ghJobRepo.findById(task.workflowRunId);
      if (ghJob && ghJob.status !== ghApiStatus.status) {
        this.logger.info(
          {
            workflowRunId: task.workflowRunId,
            fromGhStatus: ghJob.status,
            toGhStatus: ghApiStatus.status,
          },
          "Syncing gh_automation_jobs status from GhostHands API",
        );
        const now = new Date();
        const updateData: Record<string, unknown> = {
          status: ghApiStatus.status,
          statusMessage: ghApiStatus.status_message ?? null,
          updatedAt: now,
        };
        if (ghApiStatus.timestamps.completed_at) {
          updateData.completedAt = new Date(ghApiStatus.timestamps.completed_at);
        }
        if (ghApiStatus.error) {
          updateData.errorCode = ghApiStatus.error.code;
          updateData.errorDetails = ghApiStatus.error;
        }
        if (ghApiStatus.result) {
          updateData.resultData = ghApiStatus.result;
        }
        await this.ghJobRepo.updateStatus(
          task.workflowRunId,
          updateData as Parameters<typeof this.ghJobRepo.updateStatus>[1],
        );
        ghJobUpdated = true;
      }

      const finalTaskStatus = mappedTaskStatus ?? task.status;
      return {
        taskId,
        previousTaskStatus,
        newTaskStatus: finalTaskStatus,
        ghApiStatus: ghApiStatus.status,
        ghJobPreviousStatus: ghJob?.status ?? null,
        taskUpdated,
        ghJobUpdated,
        message: taskUpdated || ghJobUpdated ? "Status synced from GhostHands" : "Already in sync",
      };
    } catch (err) {
      this.logger.warn({ err, taskId }, "Failed to sync task with GhostHands API");
      return { taskId, error: "Failed to fetch GH status" };
    }
  }

  /** @deprecated Use syncGhJobStatus instead */
  async syncTaskWithGh(taskId: string) {
    return this.syncGhJobStatus(taskId);
  }

  /**
   * Admin: list all tasks across all users with optional filters.
   */
  async listAll(query: {
    page: number;
    pageSize: number;
    status?: string;
    platform?: string;
    search?: string;
    userId?: string;
    sortBy: string;
    sortOrder: string;
  }) {
    const { data, total } = await this.taskRepo.findManyAdmin(query);

    // Enrich each task with GH job data
    const enriched = await Promise.all(
      data.map(async (task) => {
        const ghJob = await this.fetchGhJobData(task.workflowRunId, task.status as TaskStatus);
        return { ...task, ghJob };
      }),
    );

    return {
      data: enriched,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
