import { eq, and, sql, inArray, asc } from "drizzle-orm";
import { ghAutomationJobs, type Database } from "@valet/db";

export interface GhJobRecord {
  id: string;
  userId: string | null;
  jobType: string | null;
  targetUrl: string | null;
  status: string;
  statusMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lastHeartbeat: Date | null;
  workerId: string | null;
  engineType: string | null;
  executionMode: string | null;
  resultData: Record<string, unknown> | null;
  resultSummary: string | null;
  errorCode: string | null;
  errorDetails: Record<string, unknown> | null;
  screenshotUrls: unknown | null;
  actionCount: number | null;
  totalTokens: number | null;
  llmCostCents: number | null;
  targetWorkerId: string | null;
  valetTaskId: string | null;
  interactionType: string | null;
  interactionData: Record<string, unknown> | null;
  pausedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: Record<string, unknown>): GhJobRecord {
  return {
    id: row.id as string,
    userId: (row.userId as string) ?? null,
    jobType: (row.jobType as string) ?? null,
    targetUrl: (row.targetUrl as string) ?? null,
    status: row.status as string,
    statusMessage: (row.statusMessage as string) ?? null,
    startedAt: (row.startedAt as Date) ?? null,
    completedAt: (row.completedAt as Date) ?? null,
    lastHeartbeat: (row.lastHeartbeat as Date) ?? null,
    workerId: (row.workerId as string) ?? null,
    engineType: (row.engineType as string) ?? null,
    executionMode: (row.executionMode as string) ?? null,
    resultData: (row.resultData as Record<string, unknown>) ?? null,
    resultSummary: (row.resultSummary as string) ?? null,
    errorCode: (row.errorCode as string) ?? null,
    errorDetails: (row.errorDetails as Record<string, unknown>) ?? null,
    screenshotUrls: row.screenshotUrls ?? null,
    actionCount: (row.actionCount as number) ?? null,
    totalTokens: (row.totalTokens as number) ?? null,
    llmCostCents: (row.llmCostCents as number) ?? null,
    targetWorkerId: (row.targetWorkerId as string) ?? null,
    valetTaskId: (row.valetTaskId as string) ?? null,
    interactionType: (row.interactionType as string) ?? null,
    interactionData: (row.interactionData as Record<string, unknown>) ?? null,
    pausedAt: (row.pausedAt as Date) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export class GhAutomationJobRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findById(id: string): Promise<GhJobRecord | null> {
    const rows = await this.db
      .select()
      .from(ghAutomationJobs)
      .where(eq(ghAutomationJobs.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row as Record<string, unknown>) : null;
  }

  async findByValetTaskId(valetTaskId: string): Promise<GhJobRecord | null> {
    const rows = await this.db
      .select()
      .from(ghAutomationJobs)
      .where(eq(ghAutomationJobs.valetTaskId, valetTaskId))
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row as Record<string, unknown>) : null;
  }

  async updateStatus(
    id: string,
    data: {
      status: string;
      statusMessage?: string | null;
      errorCode?: string | null;
      errorDetails?: Record<string, unknown> | null;
      startedAt?: Date | null;
      completedAt?: Date | null;
      lastHeartbeat?: Date | null;
      resultData?: Record<string, unknown> | null;
      resultSummary?: string | null;
      actionCount?: number | null;
      totalTokens?: number | null;
      llmCostCents?: number | null;
      interactionType?: string | null;
      interactionData?: Record<string, unknown> | null;
      pausedAt?: Date | null;
    },
  ): Promise<GhJobRecord | null> {
    const updates: Record<string, unknown> = {
      status: data.status,
      updatedAt: new Date(),
    };
    if (data.statusMessage !== undefined) updates.statusMessage = data.statusMessage;
    if (data.errorCode !== undefined) updates.errorCode = data.errorCode;
    if (data.errorDetails !== undefined) updates.errorDetails = data.errorDetails;
    if (data.startedAt !== undefined) updates.startedAt = data.startedAt;
    if (data.completedAt !== undefined) updates.completedAt = data.completedAt;
    if (data.lastHeartbeat !== undefined) updates.lastHeartbeat = data.lastHeartbeat;
    if (data.resultData !== undefined) updates.resultData = data.resultData;
    if (data.resultSummary !== undefined) updates.resultSummary = data.resultSummary;
    if (data.actionCount !== undefined) updates.actionCount = data.actionCount;
    if (data.totalTokens !== undefined) updates.totalTokens = data.totalTokens;
    if (data.llmCostCents !== undefined) updates.llmCostCents = data.llmCostCents;
    if (data.interactionType !== undefined) updates.interactionType = data.interactionType;
    if (data.interactionData !== undefined) updates.interactionData = data.interactionData;
    if (data.pausedAt !== undefined) updates.pausedAt = data.pausedAt;

    const rows = await this.db
      .update(ghAutomationJobs)
      .set(updates)
      .where(eq(ghAutomationJobs.id, id))
      .returning();
    const row = rows[0];
    return row ? toRecord(row as Record<string, unknown>) : null;
  }

  async findStuckJobs(stuckMinutes = 30): Promise<GhJobRecord[]> {
    const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000);
    const rows = await this.db
      .select()
      .from(ghAutomationJobs)
      .where(
        and(
          inArray(ghAutomationJobs.status, ["queued", "running"]),
          sql`${ghAutomationJobs.updatedAt} < ${cutoff}`,
        ),
      )
      .orderBy(asc(ghAutomationJobs.updatedAt))
      .limit(100);
    return rows.map((r) => toRecord(r as Record<string, unknown>));
  }
}
