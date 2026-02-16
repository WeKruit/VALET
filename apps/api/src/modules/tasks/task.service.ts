import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { ApplicationMode, ExternalStatus } from "@valet/shared/schemas";
import type { TaskRepository } from "./task.repository.js";
import type { ResumeRepository } from "../resumes/resume.repository.js";
import type { QaBankRepository } from "../qa-bank/qa-bank.repository.js";
import type { GhostHandsClient } from "../ghosthands/ghosthands.client.js";
import type { GHProfile, GHEducation, GHWorkHistory } from "../ghosthands/ghosthands.types.js";
import { TaskNotFoundError, TaskNotCancellableError } from "./task.errors.js";
import { publishToUser } from "../../websocket/handler.js";

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
  private redis: Redis;
  private logger: FastifyBaseLogger;

  constructor({
    taskRepo,
    resumeRepo,
    qaBankRepo,
    ghosthandsClient,
    redis,
    logger,
  }: {
    taskRepo: TaskRepository;
    resumeRepo: ResumeRepository;
    qaBankRepo: QaBankRepository;
    ghosthandsClient: GhostHandsClient;
    redis: Redis;
    logger: FastifyBaseLogger;
  }) {
    this.taskRepo = taskRepo;
    this.resumeRepo = resumeRepo;
    this.qaBankRepo = qaBankRepo;
    this.ghosthandsClient = ghosthandsClient;
    this.redis = redis;
    this.logger = logger;
  }

  async getById(id: string, userId: string) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);
    return task;
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
        quality: body.mode === "autopilot" ? "fast" : "thorough",
        max_retries: 1,
        ...(body.targetWorkerId ? { target_worker_id: body.targetWorkerId } : {}),
      });

      // Store the GhostHands job ID in workflowRunId field
      await this.taskRepo.updateWorkflowRunId(task.id, ghResponse.job_id);
      await this.taskRepo.updateStatus(task.id, "queued");

      // Notify WebSocket clients
      await publishToUser(this.redis, userId, {
        type: "task_update",
        taskId: task.id,
        status: "queued",
        progress: 0,
        currentStep: "Submitted to GhostHands",
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
    });

    const callbackUrl = buildCallbackUrl();

    try {
      const ghResponse = await this.ghosthandsClient.submitGenericTask({
        valet_task_id: task.id,
        valet_user_id: userId,
        job_type: "custom",
        target_url: "https://www.google.com",
        task_description: `Google search integration test: ${body.searchQuery}`,
        callback_url: callbackUrl,
        max_retries: 1,
        target_worker_id: body.targetWorkerId,
      });

      await this.taskRepo.updateWorkflowRunId(task.id, ghResponse.job_id);
      await this.taskRepo.updateStatus(task.id, "queued");

      await publishToUser(this.redis, userId, {
        type: "task_update",
        taskId: task.id,
        status: "queued",
        progress: 0,
        currentStep: "Integration test submitted to GhostHands",
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

    return task;
  }

  async cancel(id: string, userId: string) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    if (!CANCELLABLE_STATUSES.has(task.status)) {
      throw new TaskNotCancellableError(id, task.status);
    }

    await this.taskRepo.cancel(id);

    // Try to cancel the GhostHands job if one exists
    if (task.workflowRunId) {
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

  async approve(id: string, userId: string, fieldOverrides?: Record<string, string>) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    this.logger.info(
      { taskId: id, fieldOverrides },
      "Task approved (GhostHands handles continuation)",
    );

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

    this.logger.info({ taskId: id }, "Captcha solved (GhostHands handles continuation)");

    await this.taskRepo.updateStatus(id, "in_progress");
  }
}
