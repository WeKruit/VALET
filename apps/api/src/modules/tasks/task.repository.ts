import { eq, and, desc, asc, count, sql, ilike, or, type SQL } from "drizzle-orm";
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
      this.db
        .select({ count: count() })
        .from(tasks)
        .where(whereClause),
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
    return toTaskRecord(rows[0] as Record<string, unknown>);
  }

  async updateStatus(id: string, status: TaskStatus): Promise<TaskRecord | null> {
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
    const row = rows[0];
    return row ? toTaskRecord(row as Record<string, unknown>) : null;
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
