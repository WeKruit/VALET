import { eq, sql, count, and, gte } from "drizzle-orm";
import { tasks, type Database } from "@valet/db";

export class DashboardService {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
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
        failed: count(
          sql`CASE WHEN ${tasks.status} = 'failed' THEN 1 END`,
        ),
      })
      .from(tasks)
      .where(eq(tasks.userId, userId));

    return rows[0] ?? { total: 0, completed: 0, inProgress: 0, needsReview: 0, failed: 0 };
  }

  async getTrends(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rows = await this.db
      .select({
        date: sql<string>`to_char(${tasks.createdAt}::date, 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          gte(tasks.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(sql`${tasks.createdAt}::date`)
      .orderBy(sql`${tasks.createdAt}::date`);

    // Fill in missing days with 0
    const trendMap = new Map(rows.map((r) => [r.date, r.count]));
    const trends: { date: string; count: number }[] = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      trends.push({ date: key, count: trendMap.get(key) ?? 0 });
    }

    return { trends };
  }

  async getBreakdown(userId: string) {
    const rows = await this.db
      .select({
        platform: tasks.platform,
        count: count(),
      })
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .groupBy(tasks.platform)
      .orderBy(sql`count(*) DESC`);

    return { breakdown: rows };
  }
}
