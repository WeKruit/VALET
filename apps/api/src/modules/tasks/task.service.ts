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
import type { SandboxRepository } from "../sandboxes/sandbox.repository.js";
import type { UserSandboxRepository } from "../sandboxes/user-sandbox.repository.js";
import type { AtmFleetClient } from "../sandboxes/atm-fleet.client.js";
import type { BrowserSessionResponse } from "@valet/shared/schemas";
import { browserSessionTokenStore } from "./browser-session-token-store.js";
import type { GhostHandsClient } from "../ghosthands/ghosthands.client.js";
import type { GHProfile, GHEducation, GHWorkHistory } from "../ghosthands/ghosthands.types.js";
import type { GhAutomationJobRepository } from "../ghosthands/gh-automation-job.repository.js";
import type { GhBrowserSessionRepository } from "../ghosthands/gh-browser-session.repository.js";
import { QUEUE_APPLY_JOB, type TaskQueueService } from "./task-queue.service.js";
import type { GhJobEventRepository } from "../ghosthands/gh-job-event.repository.js";
import type { SubmissionProofRepository } from "./submission-proof.repository.js";
import {
  TaskNotFoundError,
  TaskNotCancellableError,
  TaskNotResolvableError,
} from "./task.errors.js";
import { AppError } from "../../common/errors.js";
import { publishToUser } from "../../websocket/handler.js";
import type { CreditService } from "../credits/credit.service.js";
import type { UserRepository } from "../users/user.repository.js";
import type { LocalWorkerBrokerService } from "../local-workers/local-worker-broker.service.js";
import { isSupportedJobUrl } from "@valet/shared/schemas";

function useQueueDispatch(): boolean {
  return process.env.TASK_DISPATCH_MODE === "queue";
}

const CANCELLABLE_STATUSES = new Set([
  "created",
  "queued",
  "testing",
  "in_progress",
  "waiting_human",
]);

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
  return `${base}${sep}token=${encodeURIComponent(token)}`;
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
  private sandboxRepo: SandboxRepository;
  private userSandboxRepo: UserSandboxRepository;
  private atmFleetClient: AtmFleetClient;
  private submissionProofRepo: SubmissionProofRepository;
  private creditService: CreditService;
  private userRepo: UserRepository;
  private localWorkerBrokerService: LocalWorkerBrokerService;

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
    sandboxRepo,
    userSandboxRepo,
    atmFleetClient,
    submissionProofRepo,
    creditService,
    userRepo,
    localWorkerBrokerService,
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
    sandboxRepo: SandboxRepository;
    userSandboxRepo: UserSandboxRepository;
    atmFleetClient: AtmFleetClient;
    submissionProofRepo: SubmissionProofRepository;
    creditService: CreditService;
    userRepo: UserRepository;
    localWorkerBrokerService: LocalWorkerBrokerService;
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
    this.sandboxRepo = sandboxRepo;
    this.userSandboxRepo = userSandboxRepo;
    this.atmFleetClient = atmFleetClient;
    this.submissionProofRepo = submissionProofRepo;
    this.creditService = creditService;
    this.userRepo = userRepo;
    this.localWorkerBrokerService = localWorkerBrokerService;
  }

  /**
   * Validate URL is a supported job application site.
   * Throws AppError.badRequest if unsupported.
   */
  private validateJobUrl(jobUrl: string): void {
    if (!isSupportedJobUrl(jobUrl)) {
      throw AppError.badRequest(
        `Unsupported job URL. Supported sites include LinkedIn, Greenhouse, Lever, Workday, and others.`,
      );
    }
  }

  /**
   * Enforce executionTarget policy:
   * - "cloud": only admin/superadmin
   * - "desktop": authenticated + completed onboarding + parsed default resume + registered desktop worker
   */
  private async enforceExecutionTargetPolicy(
    userId: string,
    userRole: string,
    executionTarget: "cloud" | "desktop",
    desktopWorkerId?: string,
  ): Promise<void> {
    if (executionTarget === "cloud") {
      if (userRole !== "admin" && userRole !== "superadmin") {
        throw AppError.forbidden("Cloud execution is only available to admin users.");
      }
      return;
    }

    // executionTarget === "desktop"
    // 1. Check onboarding completed
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw AppError.notFound("User not found");
    }
    if (!(user as Record<string, unknown>).onboardingCompletedAt) {
      throw AppError.forbidden("Complete onboarding before creating tasks.");
    }

    // 2. Check parsed default resume exists
    const resumes = await this.resumeRepo.findByUserId(userId);
    const defaultResume = resumes.find((r) => r.isDefault && r.parsedData != null);
    if (!defaultResume) {
      throw AppError.forbidden("Upload and parse a default resume before creating tasks.");
    }

    // 3. Check desktop worker is registered and belongs to user
    if (!desktopWorkerId) {
      throw AppError.badRequest("desktopWorkerId is required when executionTarget is 'desktop'.");
    }
    // The broker stores worker sessions in Redis keyed by desktopWorkerId.
    // We read the session directly via Redis to verify registration + ownership.
    const sessionKey = `gh:local-worker:session:${desktopWorkerId}`;
    const sessionRaw = await this.redis.get(sessionKey);
    if (!sessionRaw) {
      throw AppError.forbidden("Desktop worker is not registered. Launch the desktop app first.");
    }
    try {
      const session = JSON.parse(sessionRaw) as { userId: string; expiresAt: number };
      if (session.userId !== userId) {
        throw AppError.forbidden("Desktop worker belongs to a different user.");
      }
      if (session.expiresAt <= Date.now()) {
        throw AppError.forbidden("Desktop worker session has expired. Restart the desktop app.");
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.forbidden("Desktop worker session is invalid.");
    }
  }

  /**
   * Resolve the sandbox assignment for a user. Auto-assigns if no existing assignment.
   * Returns null when no healthy sandbox is available (falls back to general queue).
   */
  private async resolveUserSandbox(userId: string): Promise<string | null> {
    // 1. Check existing assignment
    const existing = await this.userSandboxRepo.findByUserId(userId);
    if (existing) {
      const sandbox = await this.sandboxRepo.findById(existing.sandboxId);
      if (sandbox && sandbox.status === "active" && sandbox.healthStatus === "healthy") {
        return existing.sandboxId;
      }
      this.logger.warn(
        {
          userId,
          sandboxId: existing.sandboxId,
          sandboxStatus: sandbox?.status,
          sandboxHealth: sandbox?.healthStatus,
        },
        "User's assigned sandbox is unavailable — attempting auto-reassign",
      );
    }

    // 2. Auto-assign to best available sandbox
    const bestSandboxId = await this.userSandboxRepo.findBestAvailableSandbox();
    if (!bestSandboxId) {
      this.logger.warn(
        { userId },
        "No healthy sandbox available for auto-assignment — using general queue",
      );
      return null;
    }

    await this.userSandboxRepo.assign(userId, bestSandboxId);
    this.logger.info({ userId, sandboxId: bestSandboxId }, "Auto-assigned user to sandbox");
    return bestSandboxId;
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

  async getProof(taskId: string, userId: string) {
    // Verify user owns the task
    const task = await this.taskRepo.findById(taskId, userId);
    if (!task) throw new TaskNotFoundError(taskId);

    // Look up the proof row
    const proof = await this.submissionProofRepo.findByTaskId(taskId, userId);

    type AnswerSource = "resume" | "qa_bank" | "llm" | "user";
    const VALID_SOURCES = new Set<string>(["resume", "qa_bank", "llm", "user"]);

    // Build the response — even without a proof row, return aggregated data from the task itself
    const screenshots: Array<{ url: string; label?: string | null; capturedAt?: Date | null }> = [];
    const answers: Array<{ field: string; value: string; source?: AnswerSource | null }> = [];
    const timeline: Array<{
      step: string;
      status: "completed" | "skipped" | "failed";
      timestamp: Date;
      detail?: string | null;
    }> = [];

    if (proof) {
      // Parse structured proof data
      if (Array.isArray(proof.screenshots)) {
        for (const s of proof.screenshots as Array<Record<string, unknown>>) {
          screenshots.push({
            url: String(s.url ?? ""),
            label: (s.label as string) ?? null,
            capturedAt: s.capturedAt ? new Date(s.capturedAt as string) : null,
          });
        }
      }
      if (Array.isArray(proof.answers)) {
        for (const a of proof.answers as Array<Record<string, unknown>>) {
          const rawSource = (a.source as string) ?? null;
          answers.push({
            field: String(a.field ?? ""),
            value: String(a.value ?? ""),
            source: rawSource && VALID_SOURCES.has(rawSource) ? (rawSource as AnswerSource) : null,
          });
        }
      }
      if (Array.isArray(proof.timeline)) {
        for (const t of proof.timeline as Array<Record<string, unknown>>) {
          timeline.push({
            step: String(t.step ?? ""),
            status: (t.status as "completed" | "skipped" | "failed") ?? "completed",
            timestamp: new Date((t.timestamp as string) ?? Date.now()),
            detail: (t.detail as string) ?? null,
          });
        }
      }
    }

    // Fallback: pull screenshots from task.screenshots (ghJobId-based)
    if (screenshots.length === 0 && task.screenshots) {
      const ss = task.screenshots as Record<string, unknown>;
      for (const [key, val] of Object.entries(ss)) {
        if (key === "ghJobId") continue;
        if (typeof val === "string") {
          screenshots.push({ url: val, label: key });
        }
      }
    }

    return {
      taskId,
      screenshots,
      answers,
      timeline,
      externalStatus: (proof?.externalStatus ??
        task.externalStatus ??
        null) as ExternalStatus | null,
      confirmationData: (proof?.confirmationData as Record<string, unknown> | null) ?? null,
      resumeVariantId: proof?.resumeVariantId ?? null,
      createdAt: proof?.createdAt ?? task.completedAt ?? null,
    };
  }

  private async fetchGhJobData(workflowRunId: string | null, taskStatus?: TaskStatus) {
    if (!workflowRunId) return null;

    const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
    const GH_NON_TERMINAL = new Set([
      "pending",
      "queued",
      "running",
      "paused",
      "needs_human",
      "awaiting_review",
      "resumed", // legacy compatibility
    ]);

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
            createdAt: new Date(job.createdAt).toISOString(),
            startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
            completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
          },
          targetWorkerId: job.targetWorkerId ?? null,
          browserSessionAvailable:
            (job.metadata as Record<string, unknown>)?.browser_session_available === true,
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
        browserSessionAvailable: (raw.browser_session_available as boolean) === true,
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
      excludeTest?: boolean;
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

  /**
   * Create a new application task and dispatch it to GhostHands.
   *
   * ## Worker routing
   *
   * - **Path 1 — Admin explicit (targetWorkerId set):** The caller passes a
   *   sandbox UUID (e.g. from the admin test page). We resolve it to an actual
   *   GH worker UUID via `sandboxRepo.resolveWorkerId()` and enqueue to the
   *   worker-specific queue (`gh_apply_job/{resolvedWorkerId}`). Uses "strict"
   *   affinity. If resolution fails, falls back to the general queue.
   *
   * - **Path 2 — Normal user (no targetWorkerId):** Auto-resolve via the
   *   `user_sandboxes` table. If the user has an active+healthy assignment,
   *   route there. Otherwise auto-assign to the best available sandbox. Uses
   *   "preferred" affinity so jobs still get picked up if the target is
   *   temporarily unavailable. Falls back to general queue if no sandbox is
   *   available.
   */
  async create(
    body: {
      jobUrl: string;
      mode: ApplicationMode;
      resumeId: string;
      notes?: string;
      quality?: "speed" | "balanced" | "quality";
      targetWorkerId?: string;
      reasoningModel?: string;
      visionModel?: string;
      executionTarget?: "cloud" | "desktop";
      desktopWorkerId?: string;
    },
    userId: string,
    userRole?: string,
  ) {
    // Validate supported job URL
    this.validateJobUrl(body.jobUrl);

    // Enforce execution target policy
    const target = body.executionTarget ?? "desktop";
    await this.enforceExecutionTargetPolicy(
      userId,
      userRole ?? "user",
      target,
      body.desktopWorkerId,
    );

    // Resolve sandbox routing
    let resolvedSandboxId = body.targetWorkerId; // admin explicit override
    const isAdminExplicit = !!body.targetWorkerId;

    if (!resolvedSandboxId) {
      resolvedSandboxId = (await this.resolveUserSandbox(userId)) ?? undefined;
    }

    // Validate resume exists before insert
    const resume = await this.resumeRepo.findById(body.resumeId, userId);
    if (!resume) {
      throw AppError.notFound(`Resume ${body.resumeId} not found`);
    }

    // Tag notes with sandbox ID for tracking
    const notes = resolvedSandboxId
      ? `${body.notes ?? ""} [sandbox:${resolvedSandboxId}]`.trim()
      : body.notes;

    let task: Awaited<ReturnType<typeof this.taskRepo.create>>;
    try {
      task = await this.taskRepo.create({
        userId,
        jobUrl: body.jobUrl,
        mode: body.mode,
        resumeId: body.resumeId,
        notes,
        sandboxId: resolvedSandboxId,
      });
    } catch (err: unknown) {
      // Postgres 23503 = foreign_key_violation. Only catch the resume FK specifically;
      // other FK failures (e.g. sandbox_id) should bubble as 500.
      const pgCode = (err as { code?: string }).code;
      const pgConstraint = (err as { constraint?: string }).constraint;
      if (pgCode === "23503" && pgConstraint === "tasks_resume_id_resumes_id_fk") {
        throw AppError.notFound(`Resume ${body.resumeId} no longer exists`);
      }
      throw err;
    }

    // Credit enforcement (feature-flagged) — debit AFTER task creation so we have a real task UUID
    // Admin/superadmin users are exempt from credit enforcement
    const isAdminRole = userRole === "admin" || userRole === "superadmin";
    if (process.env.FEATURE_CREDITS_ENFORCEMENT === "true" && !isAdminRole) {
      try {
        const debit = await this.creditService.debitForTask(
          userId,
          task.id,
          `task-create-${task.id}`,
        );
        if (!debit.success) {
          // Insufficient credits — clean up the task row
          await this.taskRepo.delete(task.id);
          throw AppError.paymentRequired(
            "Insufficient credits. Purchase more credits or upgrade your plan.",
          );
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Infra/DB error during debit — clean up the task row and re-throw
        await this.taskRepo.delete(task.id).catch(() => {});
        throw err;
      }
    }

    // Resolve sandbox UUID → GH worker UUID for queue routing
    let queueTargetWorkerId: string | undefined;
    if (resolvedSandboxId) {
      const ghWorkerId = await this.sandboxRepo.resolveWorkerId(resolvedSandboxId);
      if (ghWorkerId) {
        queueTargetWorkerId = ghWorkerId;
      } else {
        this.logger.warn(
          { sandboxId: resolvedSandboxId },
          "No active worker for sandbox, using general queue",
        );
      }
    }

    // Build profile from parsed resume data (resume was already validated above)
    const profile = this.buildGhosthandsProfile(
      resume.parsedData as Record<string, unknown> | null,
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

    if (useQueueDispatch() && !this.taskQueueService.isAvailable) {
      // Queue mode configured but pg-boss is down — fail immediately instead of
      // silently falling back to REST (GH workers in queue mode won't pick it up).
      this.logger.error(
        { taskId: task.id },
        "TASK_DISPATCH_MODE=queue but pg-boss unavailable — failing task. Fix DATABASE_DIRECT_URL or pg-boss connection.",
      );
      await this.taskRepo.updateStatus(task.id, "failed");
      await this.taskRepo.updateGhosthandsResult(task.id, {
        ghJobId: "",
        result: null,
        error: {
          code: "GH_QUEUE_UNAVAILABLE",
          message: "Task queue is temporarily unavailable. Please try again in a few minutes.",
        },
        completedAt: null,
      });
      // Refund credit — dispatch never happened
      await this.refundCreditIfDebited(userId, task.id, userRole);
      return task;
    }

    if (useQueueDispatch()) {
      // ── Queue dispatch path (pg-boss) ──
      try {
        let ghJob = await this.ghJobRepo.createJob({
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
            quality_preset: body.quality ?? (body.mode === "autopilot" ? "speed" : "quality"),
            ...(body.reasoningModel ? { model: body.reasoningModel } : {}),
            ...(body.visionModel ? { image_model: body.visionModel } : {}),
          },
          callbackUrl,
          valetTaskId: task.id,
        });

        await this.taskRepo.updateWorkflowRunId(task.id, ghJob.id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (task as any).workflowRunId = ghJob.id;

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
          { targetWorkerId: queueTargetWorkerId },
        );

        if (pgBossJobId) {
          await this.ghJobRepo.updateStatus(ghJob.id, {
            status: "queued",
            metadata: {
              ...(ghJob.metadata ?? {}),
              pgBossJobId,
              pgBossQueueName: QUEUE_APPLY_JOB,
            },
          });
        }

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
        // Refund credit — dispatch failed before GH received the job
        await this.refundCreditIfDebited(userId, task.id, userRole);
      }
    } else {
      // ── REST dispatch path (legacy, only when TASK_DISPATCH_MODE != queue) ──
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
          quality: body.quality ?? (body.mode === "autopilot" ? "speed" : "quality"),
          ...(body.reasoningModel ? { model: body.reasoningModel } : {}),
          ...(body.visionModel ? { image_model: body.visionModel } : {}),
          max_retries: 1,
          ...(resolvedSandboxId
            ? {
                target_worker_id: resolvedSandboxId,
                worker_affinity: (isAdminExplicit ? "strict" : "preferred") as
                  | "strict"
                  | "preferred",
              }
            : {}),
        });

        await this.taskRepo.updateWorkflowRunId(task.id, ghResponse.job_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (task as any).workflowRunId = ghResponse.job_id;
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
        // Refund credit — REST dispatch failed before GH received the job
        await this.refundCreditIfDebited(userId, task.id, userRole);
      }
    }

    return task;
  }

  /**
   * Create multiple tasks in a batch. Wraps the existing create() path per-URL.
   * - Normalizes and deduplicates URLs
   * - Preflight credit check if enforcement is on
   * - Per-item error handling: continue on expected errors, abort on infra errors
   */
  async createBatch(
    body: {
      jobUrls: string[];
      resumeId: string;
      mode?: "copilot" | "autopilot";
      notes?: string;
      quality?: "speed" | "balanced" | "quality";
      targetWorkerId?: string;
      reasoningModel?: string;
      visionModel?: string;
      executionTarget?: "cloud" | "desktop";
      desktopWorkerId?: string;
    },
    userId: string,
    userRole?: string,
  ) {
    // Enforce execution target policy once for the whole batch
    const target = body.executionTarget ?? "desktop";
    await this.enforceExecutionTargetPolicy(
      userId,
      userRole ?? "user",
      target,
      body.desktopWorkerId,
    );

    const { normalizeJobUrl } = await import("@valet/shared/schemas");
    const results: Array<{
      jobUrl: string;
      status: "created" | "duplicate" | "failed" | "skipped";
      taskId?: string;
      workflowRunId?: string;
      error?: string;
    }> = [];
    let created = 0;
    let duplicates = 0;
    let failed = 0;
    let skipped = 0;
    let aborted = false;

    // 1. Normalize and deduplicate URLs
    const seenNormalized = new Map<string, number>();
    const urlEntries: Array<{ original: string; normalized: string; isDuplicate: boolean }> = [];

    for (let i = 0; i < body.jobUrls.length; i++) {
      const original = body.jobUrls[i]!;
      const normalized = normalizeJobUrl(original);
      const existingIdx = seenNormalized.get(normalized);
      if (existingIdx !== undefined) {
        urlEntries.push({ original, normalized, isDuplicate: true });
      } else {
        seenNormalized.set(normalized, i);
        urlEntries.push({ original, normalized, isDuplicate: false });
      }
    }

    const uniqueCount = urlEntries.filter((e) => !e.isDuplicate).length;

    // 2. Preflight credit check (admin/superadmin exempt)
    const isAdminRole = userRole === "admin" || userRole === "superadmin";
    if (process.env.FEATURE_CREDITS_ENFORCEMENT === "true" && !isAdminRole) {
      const { balance } = await this.creditService.getBalance(userId);
      if (balance < uniqueCount) {
        throw AppError.paymentRequired(
          `Insufficient credits: ${balance} available, ${uniqueCount} required for this batch.`,
        );
      }
    }

    // 3. Process each URL sequentially (create() handles debit per-task)
    for (const entry of urlEntries) {
      if (aborted) {
        results.push({
          jobUrl: entry.original,
          status: "skipped",
          error: "Batch aborted due to infrastructure error",
        });
        skipped++;
        continue;
      }

      if (entry.isDuplicate) {
        results.push({
          jobUrl: entry.original,
          status: "duplicate",
          error: "Duplicate URL in batch",
        });
        duplicates++;
        continue;
      }

      try {
        const task = await this.create(
          {
            jobUrl: entry.normalized,
            mode: body.mode ?? "copilot",
            resumeId: body.resumeId,
            notes: body.notes,
            quality: body.quality,
            targetWorkerId: body.targetWorkerId,
            reasoningModel: body.reasoningModel,
            visionModel: body.visionModel,
            executionTarget: body.executionTarget,
            desktopWorkerId: body.desktopWorkerId,
          },
          userId,
          userRole,
        );
        results.push({
          jobUrl: entry.original,
          status: "created",
          taskId: task.id,
          workflowRunId: task.workflowRunId ?? undefined,
        });
        created++;
      } catch (err) {
        if (err instanceof AppError) {
          // Expected user/input/payment error — record and continue
          results.push({ jobUrl: entry.original, status: "failed", error: err.message });
          failed++;
        } else {
          // Infrastructure error — abort the remainder
          this.logger.error(
            { err, jobUrl: entry.original },
            "Infra error in batch — aborting remaining",
          );
          results.push({
            jobUrl: entry.original,
            status: "failed",
            error: err instanceof Error ? err.message : "Internal error",
          });
          failed++;
          aborted = true;
        }
      }
    }

    // 4. Post-run balance snapshot
    let balanceAfter: number | null = null;
    try {
      const { balance } = await this.creditService.getBalance(userId);
      balanceAfter = balance;
    } catch {
      // Non-critical — return null
    }

    return {
      results,
      summary: { total: body.jobUrls.length, created, duplicates, failed, skipped },
      balanceAfter,
    };
  }

  /** Refund one credit if enforcement is on. Swallows errors — dispatch already failed. */
  private async refundCreditIfDebited(
    userId: string,
    taskId: string,
    userRole?: string,
  ): Promise<void> {
    if (process.env.FEATURE_CREDITS_ENFORCEMENT !== "true") return;
    // Admin/superadmin were never debited, so skip refund
    if (userRole === "admin" || userRole === "superadmin") return;
    try {
      await this.creditService.refundTask(
        userId,
        taskId,
        `task-refund-dispatch-${taskId}`,
        "Refund: dispatch failed before job reached worker",
      );
      this.logger.info({ userId, taskId }, "Credit refunded for failed dispatch");
    } catch (err) {
      this.logger.error({ err, userId, taskId }, "Failed to refund credit after dispatch failure");
    }
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

  async createTestTask(
    body: {
      searchQuery: string;
      targetWorkerId: string;
      reasoningModel?: string;
      visionModel?: string;
    },
    userId: string,
  ) {
    // Create a task record for tracking the test
    const task = await this.taskRepo.create({
      userId,
      jobUrl: "https://www.google.com",
      mode: "autopilot",
      resumeId: "", // no resume needed for test
      notes: `Integration test: "${body.searchQuery}" [sandbox:${body.targetWorkerId}]`,
      sandboxId: body.targetWorkerId,
    });

    // Resolve sandbox UUID → GH worker ID for queue routing
    let queueTargetWorkerId: string | undefined;
    if (body.targetWorkerId) {
      try {
        const ghWorkerId = await this.sandboxRepo.resolveWorkerId(body.targetWorkerId);
        if (ghWorkerId) {
          queueTargetWorkerId = ghWorkerId;
        } else {
          this.logger.warn(
            { sandboxId: body.targetWorkerId },
            "No active worker for sandbox, using general queue",
          );
        }
      } catch (err) {
        this.logger.error(
          { sandboxId: body.targetWorkerId, err },
          "Failed to resolve worker ID, using general queue",
        );
      }
    }

    const callbackUrl = buildCallbackUrl();
    const taskDescription = `Google search integration test: ${body.searchQuery}`;

    if (useQueueDispatch() && !this.taskQueueService.isAvailable) {
      this.logger.error(
        { taskId: task.id },
        "TASK_DISPATCH_MODE=queue but pg-boss unavailable — failing test task.",
      );
      await this.taskRepo.updateStatus(task.id, "failed");
      await this.taskRepo.updateGhosthandsResult(task.id, {
        ghJobId: "",
        result: null,
        error: {
          code: "GH_QUEUE_UNAVAILABLE",
          message: "Task queue is temporarily unavailable. Please try again in a few minutes.",
        },
        completedAt: null,
      });
      return task;
    }

    if (useQueueDispatch()) {
      // ── Queue dispatch path (pg-boss) ──
      try {
        let ghJob = await this.ghJobRepo.createJob({
          userId,
          jobType: "custom",
          targetUrl: "https://www.google.com",
          taskDescription,
          inputData: { platform: "google", tier: "free" },
          maxRetries: 1,
          tags: ["valet", "test"],
          metadata: {
            ...(body.reasoningModel ? { model: body.reasoningModel } : {}),
            ...(body.visionModel ? { image_model: body.visionModel } : {}),
          },
          callbackUrl,
          valetTaskId: task.id,
          targetWorkerId: queueTargetWorkerId,
          workerAffinity: queueTargetWorkerId ? "strict" : undefined,
        });

        await this.taskRepo.updateWorkflowRunId(task.id, ghJob.id);

        // Dispatch to targeted queue if sandbox has active worker, general queue otherwise
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
          { targetWorkerId: queueTargetWorkerId },
        );

        if (pgBossJobId) {
          await this.ghJobRepo.updateStatus(ghJob.id, {
            status: "queued",
            metadata: {
              ...(ghJob.metadata ?? {}),
              pgBossJobId,
              pgBossQueueName: QUEUE_APPLY_JOB,
            },
          });
        }

        await this.taskRepo.updateStatus(task.id, "testing");

        await publishToUser(this.redis, userId, {
          type: "task_update",
          taskId: task.id,
          status: "testing",
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
      // ── REST dispatch path (legacy, only when TASK_DISPATCH_MODE != queue) ──
      try {
        const ghResponse = await this.ghosthandsClient.submitGenericTask({
          valet_task_id: task.id,
          valet_user_id: userId,
          job_type: "custom",
          target_url: "https://www.google.com",
          task_description: taskDescription,
          callback_url: callbackUrl,
          max_retries: 1,
          target_worker_id: queueTargetWorkerId,
          worker_affinity: queueTargetWorkerId ? "strict" : undefined,
          ...(body.reasoningModel ? { model: body.reasoningModel } : {}),
          ...(body.visionModel ? { image_model: body.visionModel } : {}),
        });

        await this.taskRepo.updateWorkflowRunId(task.id, ghResponse.job_id);
        await this.taskRepo.updateStatus(task.id, "testing");

        await publishToUser(this.redis, userId, {
          type: "task_update",
          taskId: task.id,
          status: "testing",
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

    if (useQueueDispatch() && !this.taskQueueService.isAvailable) {
      throw new Error("Task queue is temporarily unavailable. Please try again in a few minutes.");
    }

    if (useQueueDispatch()) {
      // Queue mode: create new gh_automation_jobs record + enqueue via pg-boss
      // Fetch original job to copy inputData (profile, QA answers, resume ref, platform, tier)
      const originalGhJob = await this.ghJobRepo.findById(task.workflowRunId);
      if (!originalGhJob) {
        throw new TaskNotResolvableError(id, "original GhostHands job not found for retry");
      }

      const callbackUrl = buildCallbackUrl();
      let ghJob = await this.ghJobRepo.createJob({
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
        metadata: {
          retryOf: task.workflowRunId,
          quality_preset: originalGhJob.metadata?.quality_preset ?? "quality",
        },
      });

      // Retry to general queue — any available worker picks it up (no affinity guarantee on retry)
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
        {},
      );

      if (pgBossJobId) {
        await this.ghJobRepo.updateStatus(ghJob.id, {
          status: "queued",
          metadata: {
            ...(((ghJob as unknown as Record<string, unknown>).metadata as Record<
              string,
              unknown
            >) ?? {}),
            pgBossJobId,
            pgBossQueueName: QUEUE_APPLY_JOB,
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

    // EC1: Cancel GH job FIRST so the worker sees "cancelled" when it polls,
    // even if the subsequent pg-boss cancel or task cancel fails.
    if (task.workflowRunId) {
      // In queue mode, mark GH job as cancelled first, then cancel pg-boss job
      if (useQueueDispatch() && this.taskQueueService.isAvailable) {
        // EC1: GH job update MUST succeed — do not swallow errors
        await this.ghJobRepo.updateStatus(task.workflowRunId, {
          status: "cancelled",
          completedAt: new Date(),
          statusMessage: "Cancelled by user via VALET",
        });

        // EC2: NOTIFY for instant cancellation (best-effort)
        try {
          await this.ghJobRepo.notifyCancel(task.workflowRunId);
        } catch (notifyErr) {
          this.logger.warn(
            { err: notifyErr, jobId: task.workflowRunId },
            "Failed to send cancel NOTIFY",
          );
        }

        // pg-boss cancel is best-effort
        try {
          const ghJob = await this.ghJobRepo.findById(task.workflowRunId);
          const pgBossJobId = ghJob?.metadata?.pgBossJobId as string | undefined;
          const pgBossQueueName = ghJob?.metadata?.pgBossQueueName as string | undefined;

          if (pgBossJobId) {
            await this.taskQueueService.cancelJob(pgBossJobId, pgBossQueueName);
          }
        } catch (err) {
          this.logger.warn(
            { err, taskId: id, jobId: task.workflowRunId },
            "Failed to cancel pg-boss job (best-effort)",
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

    // Cancel the task record AFTER GH job is marked cancelled
    await this.taskRepo.cancel(id);
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

  async stats(userId: string, excludeTest?: boolean) {
    return this.taskRepo.getStats(userId, excludeTest);
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

    // Invalidate browser-session tokens immediately — the task is about to resume
    browserSessionTokenStore.invalidateByTaskId(taskId);

    await this.ghosthandsClient.resumeJob(task.workflowRunId, {
      resolved_by: resolvedBy,
      notes,
      resolution_type: resolutionType,
      resolution_data: resolutionData,
    });

    // Do NOT update task status here — wait for GH status callback (running/resumed)
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
      pending: "queued",
      queued: "queued",
      running: "in_progress",
      paused: "waiting_human",
      awaiting_review: "waiting_human",
      needs_human: "waiting_human",
      completed: "completed",
      failed: "failed",
      cancelled: "cancelled",
      expired: "failed",
      resumed: "in_progress", // legacy compatibility
    };

    try {
      const ghApiStatus = await this.ghosthandsClient.getJobStatus(task.workflowRunId);
      let mappedTaskStatus = ghToTaskStatus[ghApiStatus.status];
      if (
        task.status === "testing" &&
        (mappedTaskStatus === "queued" || mappedTaskStatus === "in_progress")
      ) {
        mappedTaskStatus = "testing";
      }

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

  /**
   * WEK-147: Compatibility alias for /api/v1/tasks/:id/vnc-url.
   *
   * Now returns a browser-session page URL (type "browser_session") for
   * paused tasks with an available browser session. Falls through to null
   * if unavailable — no raw worker IPs are ever returned.
   */
  async getVncUrl(
    taskId: string,
    userId: string,
  ): Promise<{
    url: string;
    readOnly: boolean;
    type: "browser_session" | "novnc" | "kasm" | "kasmvnc";
  } | null> {
    const task = await this.taskRepo.findById(taskId, userId);
    if (!task) throw new TaskNotFoundError(taskId);

    // Only offer browser session for paused-for-human tasks
    if (task.status === "waiting_human") {
      try {
        const session = await this.createLiveviewSession(taskId, userId);
        return { url: session.url, readOnly: false, type: "browser_session" };
      } catch {
        // Browser session not available — fall through to null
        this.logger.debug({ taskId }, "Browser session unavailable for compat VNC URL");
      }
    }

    return null;
  }

  /**
   * Create a VALET-owned browser liveview session for a paused task.
   * Resolves the worker IP via ATM, checks GH browser-session availability,
   * mints a short-lived token, and returns a VALET web page URL.
   *
   * IP-churn guard: if the initial GH call fails, invalidates ATM caches
   * and retries resolution exactly once.
   */
  async createLiveviewSession(taskId: string, userId: string): Promise<BrowserSessionResponse> {
    const task = await this.taskRepo.findById(taskId, userId);
    if (!task) throw new TaskNotFoundError(taskId);

    if (task.status !== "waiting_human") {
      throw new TaskNotResolvableError(taskId, task.status);
    }

    // Resolve worker IP via sandbox + ATM
    if (!task.sandboxId) {
      throw new TaskNotFoundError(taskId); // no sandbox = no worker
    }
    const sandbox = await this.sandboxRepo.findById(task.sandboxId);
    if (!sandbox) {
      throw new TaskNotFoundError(taskId);
    }

    const ghServiceKey = process.env.GHOSTHANDS_SERVICE_KEY ?? process.env.GH_SERVICE_SECRET ?? "";

    let workerIp: string | null = null;
    let fleetId: string | undefined;

    // First attempt: resolve via ATM (cached)
    try {
      const resolved = await this.atmFleetClient.resolveFleetId(sandbox);
      if (resolved) {
        fleetId = resolved;
        const state = await this.atmFleetClient.getWorkerState(resolved);
        workerIp = state?.ip ?? sandbox.publicIp ?? null;
      } else {
        workerIp = sandbox.publicIp ?? null;
      }
    } catch {
      workerIp = sandbox.publicIp ?? null;
    }

    if (!workerIp) {
      throw new AppError(502, "WORKER_UNREACHABLE", "Worker unreachable — no IP available");
    }

    // Call GH /internal/browser-session
    let ghSession: Record<string, unknown> | null = null;
    try {
      ghSession = await this.callGhBrowserSession(workerIp, ghServiceKey);
    } catch (err) {
      // IP-churn guard: invalidate caches, retry ONCE
      this.logger.info(
        { taskId, workerIp, err: (err as Error).message },
        "GH browser-session call failed, retrying with fresh ATM resolution",
      );
      this.atmFleetClient.invalidateAllCaches();
      try {
        const freshFleetId = await this.atmFleetClient.resolveFleetId(sandbox);
        if (freshFleetId) {
          fleetId = freshFleetId;
          const freshState = await this.atmFleetClient.getWorkerState(freshFleetId);
          workerIp = freshState?.ip ?? null;
        } else {
          workerIp = sandbox.publicIp ?? null;
        }
        if (!workerIp) {
          throw new AppError(502, "WORKER_UNREACHABLE", "Worker unreachable after cache refresh");
        }
        ghSession = await this.callGhBrowserSession(workerIp, ghServiceKey);
      } catch {
        throw new AppError(502, "WORKER_UNREACHABLE", "Worker unreachable after retry");
      }
    }

    if (!ghSession?.available || !ghSession.pausedForHuman) {
      throw new AppError(
        503,
        "BROWSER_SESSION_UNAVAILABLE",
        "Browser session not available on worker",
      );
    }

    // Mint VALET-owned session token
    const tokenEntry = browserSessionTokenStore.mint({
      taskId,
      ghJobId: ghSession.jobId as string,
      workerIp,
      fleetId,
      pageUrl: ghSession.pageUrl as string | undefined,
      pageTitle: ghSession.pageTitle as string | undefined,
    });

    // Build page URL from WEB_URL
    const webUrl = process.env.WEB_URL;
    if (!webUrl) {
      throw new AppError(500, "CONFIG_ERROR", "WEB_URL not configured");
    }

    return {
      url: `${webUrl.replace(/\/$/, "")}/browser-session/${tokenEntry.token}`,
      expiresAt: tokenEntry.expiresAt.toISOString(),
      readOnly: false,
      type: "browser_session" as const,
      mode: "simple_browser" as const,
      pageUrl: (ghSession.pageUrl as string) ?? undefined,
      pageTitle: (ghSession.pageTitle as string) ?? undefined,
    };
  }

  private async callGhBrowserSession(
    workerIp: string,
    serviceKey: string,
  ): Promise<Record<string, unknown>> {
    const resp = await fetch(`http://${workerIp}:3100/internal/browser-session`, {
      headers: { "X-GH-Service-Key": serviceKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      throw new Error(`GH browser-session returned ${resp.status}`);
    }
    return resp.json() as Promise<Record<string, unknown>>;
  }

  /**
   * EC10: Monitor and fail stale tasks.
   * Finds tasks stuck in "queued", "testing", or "in_progress" for more than 2 hours,
   * checks if the corresponding GH job has a recent heartbeat (last 5 min),
   * and marks tasks as "failed" with errorCode "STALE_TASK" if no heartbeat.
   */
  async monitorStaleTasks(): Promise<{ handled: number; checked: number }> {
    const STALE_THRESHOLD_MINUTES = 120; // 2 hours
    const HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    const staleTasks = await this.taskRepo.findStuckJobs(STALE_THRESHOLD_MINUTES);
    let handled = 0;

    for (const task of staleTasks) {
      // Check if the GH job has a recent heartbeat
      if (task.workflowRunId) {
        try {
          const ghJob = await this.ghJobRepo.findById(task.workflowRunId);
          if (ghJob?.lastHeartbeat) {
            const heartbeatAge = Date.now() - new Date(ghJob.lastHeartbeat).getTime();
            if (heartbeatAge < HEARTBEAT_THRESHOLD_MS) {
              // GH job is still alive — skip
              continue;
            }
          }
        } catch (err) {
          this.logger.debug(
            { err, taskId: task.id, workflowRunId: task.workflowRunId },
            "Failed to check GH job heartbeat for stale task",
          );
        }
      }

      // No recent heartbeat — mark task as failed
      this.logger.warn(
        {
          taskId: task.id,
          status: task.status,
          workflowRunId: task.workflowRunId,
          updatedAt: new Date(task.updatedAt).toISOString(),
        },
        "Failing stale task — no recent GH job heartbeat",
      );

      await this.taskRepo.updateStatus(task.id, "failed");
      await this.taskRepo.updateGhosthandsResult(task.id, {
        ghJobId: task.workflowRunId ?? "",
        result: null,
        error: {
          code: "STALE_TASK",
          message: `Task stuck in "${task.status}" for over ${STALE_THRESHOLD_MINUTES} minutes with no worker heartbeat`,
        },
        completedAt: null,
      });

      // Also mark the GH job as failed if it exists
      if (task.workflowRunId) {
        try {
          await this.ghJobRepo.updateStatus(task.workflowRunId, {
            status: "failed",
            errorCode: "STALE_TASK",
            errorDetails: {
              code: "STALE_TASK",
              message: "No worker heartbeat detected — marked stale by monitor",
            },
            completedAt: new Date(),
          });
        } catch (err) {
          this.logger.warn(
            { err, taskId: task.id, workflowRunId: task.workflowRunId },
            "Failed to mark GH job as failed for stale task",
          );
        }
      }

      handled++;
    }

    if (handled > 0) {
      this.logger.info({ checked: staleTasks.length, handled }, "Stale task monitor completed");
    }

    return { handled, checked: staleTasks.length };
  }
}
