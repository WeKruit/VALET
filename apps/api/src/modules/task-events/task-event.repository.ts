import { eq, and, desc, count, type SQL } from "drizzle-orm";
import { taskEvents, type Database } from "@valet/db";

export class TaskEventRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByTaskId(
    taskId: string,
    options: {
      page: number;
      pageSize: number;
      eventType?: string;
    },
  ): Promise<{ data: any[]; total: number }> {
    const conditions: SQL[] = [eq(taskEvents.taskId, taskId)];

    if (options.eventType) {
      conditions.push(eq(taskEvents.eventType, options.eventType));
    }

    const whereClause = and(...conditions);

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(taskEvents)
        .where(whereClause)
        .orderBy(desc(taskEvents.createdAt))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize),
      this.db
        .select({ count: count() })
        .from(taskEvents)
        .where(whereClause),
    ]);

    return {
      data,
      total: totalResult[0]?.count ?? 0,
    };
  }

  async create(data: {
    taskId: string;
    eventType: string;
    fromStatus?: string;
    toStatus?: string;
    eventData?: Record<string, unknown>;
  }) {
    const rows = await this.db
      .insert(taskEvents)
      .values({
        taskId: data.taskId,
        eventType: data.eventType,
        fromStatus: data.fromStatus ?? null,
        toStatus: data.toStatus ?? null,
        eventData: data.eventData ?? {},
      })
      .returning();
    return rows[0]!;
  }
}
