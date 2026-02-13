import type { Hatchet } from "@hatchet-dev/typescript-sdk";
import type { ApplicationMode } from "@valet/shared/schemas";
import type { TaskRepository } from "./task.repository.js";
import { TaskNotFoundError, TaskNotCancellableError } from "./task.errors.js";

const CANCELLABLE_STATUSES = new Set([
  "created",
  "queued",
  "in_progress",
  "waiting_human",
]);

export class TaskService {
  private taskRepo: TaskRepository;
  private hatchet: Hatchet;

  constructor({
    taskRepo,
    hatchet,
  }: {
    taskRepo: TaskRepository;
    hatchet: Hatchet;
  }) {
    this.taskRepo = taskRepo;
    this.hatchet = hatchet;
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

  async create(
    body: {
      jobUrl: string;
      mode: ApplicationMode;
      resumeId: string;
      notes?: string;
    },
    userId: string,
  ) {
    const task = await this.taskRepo.create({
      userId,
      ...body,
    });

    const runRef = await this.hatchet.admin.runWorkflow("job-application", {
      taskId: task.id,
      jobUrl: task.jobUrl,
      userId,
      resumeId: body.resumeId,
      mode: body.mode,
    });

    const workflowRunId = await runRef.getWorkflowRunId();
    await this.taskRepo.updateWorkflowRunId(task.id, workflowRunId);

    return task;
  }

  async cancel(id: string, userId: string) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    if (!CANCELLABLE_STATUSES.has(task.status)) {
      throw new TaskNotCancellableError(id, task.status);
    }

    await this.taskRepo.cancel(id);

    if (task.workflowRunId) {
      await this.hatchet.runs.cancel({ ids: [task.workflowRunId] });
    }
  }

  async approve(
    id: string,
    userId: string,
    fieldOverrides?: Record<string, string>,
  ) {
    const task = await this.taskRepo.findById(id, userId);
    if (!task) throw new TaskNotFoundError(id);

    await this.hatchet.event.push("review_approved", {
      taskId: id,
      fieldOverrides: fieldOverrides ?? {},
    });

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

    await this.hatchet.event.push("captcha_solved", { taskId: id });

    await this.taskRepo.updateStatus(id, "in_progress");
  }
}
