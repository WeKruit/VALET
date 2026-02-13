import { eq, desc, count } from "drizzle-orm";
import { taskEvents, type Database } from "@valet/db";
import type { TaskEventType } from "@valet/shared/schemas";
import pino from "pino";

const logger = pino({ name: "event-logger" });

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

// Shared canonical event types plus worker-internal subtypes.
// Worker-internal events are stored as `checkpoint` or `state_change` with
// a `subType` field in eventData for queryability.
type EventType = TaskEventType;

export class EventLogger {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async log(
    taskId: string,
    eventType: EventType,
    data: Record<string, unknown> = {},
  ): Promise<TaskEvent> {
    const eventData = {
      ...data,
      timestamp: new Date().toISOString(),
    };

    const rows = await this.db
      .insert(taskEvents)
      .values({
        taskId,
        eventType,
        fromStatus: (data.from as string) ?? null,
        toStatus: (data.to as string) ?? null,
        eventData,
      })
      .returning();

    const row = rows[0]!;

    logger.info(
      { taskId, eventType, data },
      `Task event: ${eventType}`,
    );

    return {
      id: row.id,
      taskId: row.taskId,
      eventType: row.eventType,
      data: (row.eventData as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
    };
  }

  async getByTaskId(
    taskId: string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<{ data: TaskEvent[]; total: number }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(taskEvents)
        .where(eq(taskEvents.taskId, taskId))
        .orderBy(desc(taskEvents.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ count: count() })
        .from(taskEvents)
        .where(eq(taskEvents.taskId, taskId)),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        taskId: row.taskId,
        eventType: row.eventType,
        data: (row.eventData as Record<string, unknown>) ?? {},
        createdAt: row.createdAt,
      })),
      total: totalResult[0]?.count ?? 0,
    };
  }
}
