import { eq, and, count, desc, type SQL } from "drizzle-orm";
import { sandboxAuditLogs, type Database } from "@valet/db";

export interface AuditLogRecord {
  id: string;
  sandboxId: string;
  userId: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  result: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface AuditLogInsert {
  sandboxId: string;
  userId?: string | null;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  result?: string;
  errorMessage?: string | null;
  durationMs?: number | null;
}

export class AuditLogRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async insert(entry: AuditLogInsert): Promise<void> {
    await this.db.insert(sandboxAuditLogs).values({
      sandboxId: entry.sandboxId,
      userId: entry.userId ?? null,
      action: entry.action,
      details: entry.details ?? {},
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      result: entry.result ?? "success",
      errorMessage: entry.errorMessage ?? null,
      durationMs: entry.durationMs ?? null,
    });
  }

  async findBySandbox(
    sandboxId: string,
    options: { page: number; pageSize: number; action?: string },
  ): Promise<{ data: AuditLogRecord[]; total: number }> {
    const conditions: SQL[] = [eq(sandboxAuditLogs.sandboxId, sandboxId)];

    if (options.action) {
      conditions.push(eq(sandboxAuditLogs.action, options.action));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(sandboxAuditLogs)
        .where(whereClause)
        .orderBy(desc(sandboxAuditLogs.createdAt))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize),
      this.db.select({ count: count() }).from(sandboxAuditLogs).where(whereClause),
    ]);

    return {
      data: data as AuditLogRecord[],
      total: totalResult[0]?.count ?? 0,
    };
  }
}
