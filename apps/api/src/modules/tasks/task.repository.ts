import { eq, and, desc, asc, count, sql, ilike, inArray, or, type SQL } from "drizzle-orm";
import { tasks, type Database } from "@valet/db";
import type { TaskStatus, Platform, ApplicationMode, ExternalStatus } from "@valet/shared/schemas";

export interface TaskRecord {
  id: string;
  userId: string;
  jobUrl: string;
  platform: Platform;
  status: TaskStatus;
  mode: ApplicationMode;
  resumeId: string | null;
  jobTitle: string | null;
  companyName: string | null;
  jobLocation: string | null;
  externalStatus: ExternalStatus | null;
  progress: number;
  currentStep: string | null;
  confidenceScore: number | null;
  matchScore: number | null;
  fieldsFilled: number;
  durationSeconds: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  workflowRunId: string | null;
  browserProfileId: string | null;
  screenshots: Record<string, unknown> | null;
  llmUsage: Record<string, unknown> | null;
  notes: string | null;
  sandboxId: string | null;
  interactionType: string | null;
  interactionData: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

function toTaskRecord(row: Record<string, unknown>): TaskRecord {
  return {
    ...row,
    screenshots: (row.screenshots as Record<string, unknown>) ?? null,
    llmUsage: (row.llmUsage as Record<string, unknown>) ?? null,
    interactionType: (row.interactionType as string) ?? null,
    interactionData: (row.interactionData as Record<string, unknown>) ?? null,
  } as TaskRecord;
}

export class TaskRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findById(id: string, userId: string): Promise<TaskRecord | null> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row ? toTaskRecord(row as Record<string, unknown>) : null;
  }

  async findMany(
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
  ): Promise<{ data: TaskRecord[]; total: number }> {
    const conditions: SQL[] = [eq(tasks.userId, userId)];

    if (query.status) {
      conditions.push(eq(tasks.status, query.status as TaskStatus));
    }
    if (query.platform) {
      conditions.push(eq(tasks.platform, query.platform as Platform));
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(tasks.jobTitle, pattern),
          ilike(tasks.companyName, pattern),
          ilike(tasks.jobUrl, pattern),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const sortColumnMap = {
      updatedAt: tasks.updatedAt,
      status: tasks.status,
      jobTitle: tasks.jobTitle,
      companyName: tasks.companyName,
      createdAt: tasks.createdAt,
    } as const;
    const sortColumn = sortColumnMap[query.sortBy as keyof typeof sortColumnMap] ?? tasks.createdAt;

    const orderFn = query.sortOrder === "asc" ? asc : desc;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(tasks)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ count: count() }).from(tasks).where(whereClause),
    ]);

    return {
      data: data.map((r) => toTaskRecord(r as Record<string, unknown>)),
      total: totalResult[0]?.count ?? 0,
    };
  }

  async findAllForExport(userId: string): Promise<TaskRecord[]> {
    const data = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.createdAt));

    return data.map((r) => toTaskRecord(r as Record<string, unknown>));
  }

  async updateExternalStatus(
    id: string,
    userId: string,
    externalStatus: ExternalStatus | null,
  ): Promise<TaskRecord | null> {
    const rows = await this.db
      .update(tasks)
      .set({ externalStatus, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();
    const row = rows[0];
    return row ? toTaskRecord(row as Record<string, unknown>) : null;
  }

  async create(data: {
    userId: string;
    jobUrl: string;
    mode: ApplicationMode;
    resumeId?: string;
    notes?: string;
    sandboxId?: string;
  }): Promise<TaskRecord> {
    const rows = await this.db
      .insert(tasks)
      .values({
        userId: data.userId,
        jobUrl: data.jobUrl,
        mode: data.mode,
        resumeId: data.resumeId || null,
        notes: data.notes ?? null,
        sandboxId: data.sandboxId ?? null,
      })
      .returning();
    return toTaskRecord(rows[0] as Record<string, unknown>);
  }

  async updateStatus(id: string, status: TaskStatus): Promise<TaskRecord | null> {
    const now = new Date();
    const extra: Record<string, unknown> = { updatedAt: now };
    if (status === "completed" || status === "failed" || status === "cancelled") {
      extra.completedAt = now;
      if (status === "completed") {
        extra.progress = 100;
      }
    }
    if (status === "in_progress") {
      extra.startedAt = now;
    }

    const rows = await this.db
      .update(tasks)
      .set({ status, ...extra })
      .where(eq(tasks.id, id))
      .returning();
    const row = rows[0];
    return row ? toTaskRecord(row as Record<string, unknown>) : null;
  }

  async cancel(id: string) {
    return this.updateStatus(id, "cancelled");
  }

  async updateProgress(id: string, data: { progress?: number; currentStep?: string }) {
    await this.db
      .update(tasks)
      .set({
        ...(data.progress !== undefined ? { progress: data.progress } : {}),
        ...(data.currentStep !== undefined ? { currentStep: data.currentStep } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));
  }

  async updateWorkflowRunId(id: string, workflowRunId: string) {
    await this.db
      .update(tasks)
      .set({ workflowRunId, updatedAt: new Date() })
      .where(eq(tasks.id, id));
  }

  async updateGhosthandsResult(
    id: string,
    data: {
      ghJobId: string;
      result: Record<string, unknown> | null;
      error: Record<string, unknown> | null;
      completedAt: string | null;
    },
  ) {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      screenshots: {
        ghJobId: data.ghJobId,
        ...(data.result ?? {}),
      },
    };
    if (data.error) {
      updates.errorCode = (data.error as Record<string, unknown>).code ?? "GH_ERROR";
      updates.errorMessage = (data.error as Record<string, unknown>).message ?? "GhostHands error";
    }
    if (data.completedAt) {
      updates.completedAt = new Date(data.completedAt);
    }

    await this.db.update(tasks).set(updates).where(eq(tasks.id, id));
  }

  async updateLlmUsage(
    id: string,
    data: {
      totalCostUsd: number;
      actionCount: number;
      totalTokens: number;
      costBreakdown?: Record<string, unknown> | null;
    },
  ) {
    await this.db
      .update(tasks)
      .set({
        llmUsage: {
          totalCostUsd: data.totalCostUsd,
          actionCount: data.actionCount,
          totalTokens: data.totalTokens,
          ...(data.costBreakdown ? { costBreakdown: data.costBreakdown } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));
  }

  async findActiveBySandbox(userId: string, sandboxId: string): Promise<TaskRecord[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          inArray(tasks.status, ["created", "queued", "in_progress", "waiting_human"]),
          eq(tasks.sandboxId, sandboxId),
        ),
      )
      .orderBy(desc(tasks.createdAt))
      .limit(10);
    return rows.map((r) => toTaskRecord(r as Record<string, unknown>));
  }

  async findRecentBySandbox(userId: string, sandboxId: string): Promise<TaskRecord[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          inArray(tasks.status, ["completed", "failed", "cancelled"]),
          eq(tasks.sandboxId, sandboxId),
        ),
      )
      .orderBy(desc(tasks.completedAt))
      .limit(5);
    return rows.map((r) => toTaskRecord(r as Record<string, unknown>));
  }

  async getStats(userId: string) {
    const rows = await this.db
      .select({
        total: count(),
        completed: count(sql`CASE WHEN ${tasks.status} = 'completed' THEN 1 END`),
        inProgress: count(
          sql`CASE WHEN ${tasks.status} IN ('created', 'queued', 'in_progress') THEN 1 END`,
        ),
        needsReview: count(sql`CASE WHEN ${tasks.status} = 'waiting_human' THEN 1 END`),
      })
      .from(tasks)
      .where(eq(tasks.userId, userId));

    return rows[0] ?? { total: 0, completed: 0, inProgress: 0, needsReview: 0 };
  }

  async updateInteractionData(
    id: string,
    data: { interactionType: string; interactionData: Record<string, unknown> },
  ) {
    await this.db
      .update(tasks)
      .set({
        interactionType: data.interactionType,
        interactionData: data.interactionData,
        currentStep: `Blocked: ${data.interactionType}`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));
  }

  async findStuckJobs(stuckMinutes = 30): Promise<TaskRecord[]> {
    const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000);
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(inArray(tasks.status, ["queued", "in_progress"]), sql`${tasks.updatedAt} < ${cutoff}`),
      )
      .orderBy(asc(tasks.updatedAt))
      .limit(100);
    return rows.map((r) => toTaskRecord(r as Record<string, unknown>));
  }

  async findByWorkflowRunId(workflowRunId: string): Promise<TaskRecord | null> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workflowRunId, workflowRunId))
      .limit(1);
    const row = rows[0];
    return row ? toTaskRecord(row as Record<string, unknown>) : null;
  }

  /** Admin-only: find task by ID without userId filter */
  async findByIdAdmin(id: string): Promise<TaskRecord | null> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    const row = rows[0];
    return row ? toTaskRecord(row as Record<string, unknown>) : null;
  }

  /** Admin-only: list all tasks with optional filters */
  async findManyAdmin(query: {
    page: number;
    pageSize: number;
    status?: string;
    platform?: string;
    search?: string;
    userId?: string;
    sortBy: string;
    sortOrder: string;
  }): Promise<{ data: TaskRecord[]; total: number }> {
    const conditions: SQL[] = [];

    if (query.userId) {
      conditions.push(eq(tasks.userId, query.userId));
    }
    if (query.status) {
      conditions.push(eq(tasks.status, query.status as TaskStatus));
    }
    if (query.platform) {
      conditions.push(eq(tasks.platform, query.platform as Platform));
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(tasks.jobTitle, pattern),
          ilike(tasks.companyName, pattern),
          ilike(tasks.jobUrl, pattern),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumnMap = {
      updatedAt: tasks.updatedAt,
      status: tasks.status,
      jobTitle: tasks.jobTitle,
      companyName: tasks.companyName,
      createdAt: tasks.createdAt,
    } as const;
    const sortColumn = sortColumnMap[query.sortBy as keyof typeof sortColumnMap] ?? tasks.createdAt;

    const orderFn = query.sortOrder === "asc" ? asc : desc;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(tasks)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ count: count() }).from(tasks).where(whereClause),
    ]);

    return {
      data: data.map((r) => toTaskRecord(r as Record<string, unknown>)),
      total: totalResult[0]?.count ?? 0,
    };
  }

  async clearInteractionData(id: string) {
    await this.db
      .update(tasks)
      .set({
        interactionType: null,
        interactionData: null,
        currentStep: "Resumed",
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));
  }
}
