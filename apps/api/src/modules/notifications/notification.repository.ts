import { eq, and, desc, count } from "drizzle-orm";
import { notifications, type Database } from "@valet/db";

export class NotificationRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByUserId(
    userId: string,
    opts: { page: number; pageSize: number; unreadOnly: boolean },
  ) {
    const conditions = [eq(notifications.userId, userId)];
    if (opts.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(opts.pageSize)
        .offset((opts.page - 1) * opts.pageSize),
      this.db
        .select({ count: count() })
        .from(notifications)
        .where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count ?? 0;
    return { rows, total };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false)),
      );
    return result[0]?.count ?? 0;
  }

  async markRead(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(eq(notifications.id, id), eq(notifications.userId, userId)),
      )
      .returning({ id: notifications.id });
    return result.length > 0;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(eq(notifications.userId, userId), eq(notifications.read, false)),
      );
  }

  async create(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    const rows = await this.db
      .insert(notifications)
      .values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        metadata: data.metadata ?? {},
      })
      .returning();
    return rows[0]!;
  }
}
