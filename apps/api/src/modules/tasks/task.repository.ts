import { eq, and, desc, asc, count, sql, type SQL } from "drizzle-orm";
import { tasks, type Database } from "@valet/db";
import type { TaskStatus, Platform, ApplicationMode } from "@valet/shared/schemas";

export interface TaskRecord {
  id: string;
  userId: string;
  jobUrl: string;
  platform: Platform;
  status: TaskStatus;
  mode: ApplicationMode;
  progress: number;
  currentStep: string | null;
  confidenceScore: number | null;
  workflowRunId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
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
    return (rows[0] as TaskRecord | undefined) ?? null;
  }

  async findMany(
    userId: string,
    query: {
      page: number;
      pageSize: number;
      status?: string;
      platform?: string;
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

    const whereClause = and(...conditions);

    const sortColumn =
      query.sortBy === "updatedAt"
        ? tasks.updatedAt
        : query.sortBy === "status"
          ? tasks.status
          : tasks.createdAt;

    const orderFn = query.sortOrder === "asc" ? asc : desc;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(tasks)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ count: count() })
        .from(tasks)
        .where(whereClause),
    ]);

    return {
      data: data as TaskRecord[],
      total: totalResult[0]?.count ?? 0,
    };
  }

  async create(data: {
    userId: string;
    jobUrl: string;
    mode: ApplicationMode;
    resumeId: string;
    notes?: string;
  }): Promise<TaskRecord> {
    const rows = await this.db
      .insert(tasks)
      .values({
        userId: data.userId,
        jobUrl: data.jobUrl,
        mode: data.mode,
        resumeId: data.resumeId,
        notes: data.notes ?? null,
      })
      .returning();
    return rows[0] as TaskRecord;
  }

  async updateStatus(id: string, status: TaskStatus) {
    const now = new Date();
    const extra: Record<string, unknown> = { updatedAt: now };
    if (status === "completed" || status === "failed" || status === "cancelled") {
      extra.completedAt = now;
    }
    if (status === "in_progress") {
      extra.startedAt = now;
    }

    const rows = await this.db
      .update(tasks)
      .set({ status, ...extra })
      .where(eq(tasks.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async cancel(id: string) {
    return this.updateStatus(id, "cancelled");
  }

  async updateWorkflowRunId(id: string, workflowRunId: string) {
    await this.db
      .update(tasks)
      .set({ workflowRunId, updatedAt: new Date() })
      .where(eq(tasks.id, id));
  }

  async getStats(userId: string) {
    const rows = await this.db
      .select({
        total: count(),
        completed: count(
          sql`CASE WHEN ${tasks.status} = 'completed' THEN 1 END`,
        ),
        inProgress: count(
          sql`CASE WHEN ${tasks.status} IN ('created', 'queued', 'in_progress') THEN 1 END`,
        ),
        needsReview: count(
          sql`CASE WHEN ${tasks.status} = 'waiting_human' THEN 1 END`,
        ),
      })
      .from(tasks)
      .where(eq(tasks.userId, userId));

    return rows[0] ?? { total: 0, completed: 0, inProgress: 0, needsReview: 0 };
  }
}
