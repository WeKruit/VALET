import { eq, sql, count, and, gte, isNotNull, isNull, avg } from "drizzle-orm";
import { tasks, resumes, resumeVariants, type Database } from "@valet/db";
import type {
  VelocityResponse,
  ConversionResponse,
  ResponseRatesResponse,
  ResumePerformanceResponse,
} from "@valet/shared/schemas";

const PERIOD_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export class InsightsService {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async getVelocity(userId: string, period: string): Promise<VelocityResponse> {
    const days = PERIOD_DAYS[period] ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await this.db
      .select({
        date: sql<string>`to_char(${tasks.createdAt}::date, 'YYYY-MM-DD')`,
        total: count(),
        completed: count(sql`CASE WHEN ${tasks.status} = 'completed' THEN 1 END`),
        failed: count(sql`CASE WHEN ${tasks.status} = 'failed' THEN 1 END`),
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), gte(tasks.createdAt, since)))
      .groupBy(sql`${tasks.createdAt}::date`)
      .orderBy(sql`${tasks.createdAt}::date`);

    const dayMap = new Map(
      rows.map((r) => [r.date, { total: r.total, completed: r.completed, failed: r.failed }]),
    );

    const dataPoints: VelocityResponse["dataPoints"] = [];
    let totalTasks = 0;

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = dayMap.get(key);
      const total = entry?.total ?? 0;
      totalTasks += total;
      dataPoints.push({
        date: key,
        total,
        completed: entry?.completed ?? 0,
        failed: entry?.failed ?? 0,
      });
    }

    return {
      period: period as VelocityResponse["period"],
      dataPoints,
      totalTasks,
      avgPerDay: days > 0 ? Math.round((totalTasks / days) * 100) / 100 : 0,
    };
  }

  async getConversionByPlatform(userId: string): Promise<ConversionResponse> {
    const rows = await this.db
      .select({
        platform: tasks.platform,
        total: count(),
        completed: count(sql`CASE WHEN ${tasks.status} = 'completed' THEN 1 END`),
        failed: count(sql`CASE WHEN ${tasks.status} = 'failed' THEN 1 END`),
      })
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .groupBy(tasks.platform)
      .orderBy(sql`count(*) DESC`);

    return {
      platforms: rows.map((r) => ({
        platform: r.platform,
        total: r.total,
        completed: r.completed,
        failed: r.failed,
        conversionRate: r.total > 0 ? Math.round((r.completed / r.total) * 10000) / 100 : 0,
      })),
    };
  }

  async getResponseRates(userId: string): Promise<ResponseRatesResponse> {
    const withStatus = await this.db
      .select({
        externalStatus: tasks.externalStatus,
        count: count(),
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNotNull(tasks.externalStatus)))
      .groupBy(tasks.externalStatus)
      .orderBy(sql`count(*) DESC`);

    const withoutStatusRows = await this.db
      .select({ count: count() })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.externalStatus)));

    const totalWithStatus = withStatus.reduce((sum, r) => sum + r.count, 0);
    const totalWithoutStatus = withoutStatusRows[0]?.count ?? 0;

    return {
      totalWithStatus,
      totalWithoutStatus,
      rates: withStatus.map((r) => ({
        externalStatus: r.externalStatus ?? "unknown",
        count: r.count,
        percentage: totalWithStatus > 0 ? Math.round((r.count / totalWithStatus) * 10000) / 100 : 0,
      })),
    };
  }

  async getResumePerformance(userId: string): Promise<ResumePerformanceResponse> {
    const rows = await this.db
      .select({
        resumeId: resumeVariants.baseResumeId,
        resumeFilename: resumes.filename,
        variantCount: count(),
        avgMatchScoreBefore: avg(resumeVariants.matchScoreBefore),
        avgMatchScoreAfter: avg(resumeVariants.matchScoreAfter),
      })
      .from(resumeVariants)
      .innerJoin(resumes, eq(resumeVariants.baseResumeId, resumes.id))
      .where(eq(resumeVariants.userId, userId))
      .groupBy(resumeVariants.baseResumeId, resumes.filename)
      .orderBy(sql`count(*) DESC`);

    return {
      resumes: rows.map((r) => {
        const before = r.avgMatchScoreBefore ? Number(r.avgMatchScoreBefore) : null;
        const after = r.avgMatchScoreAfter ? Number(r.avgMatchScoreAfter) : null;
        return {
          resumeId: r.resumeId,
          resumeFilename: r.resumeFilename,
          variantCount: r.variantCount,
          avgMatchScoreBefore: before,
          avgMatchScoreAfter: after,
          avgImprovement: before != null && after != null ? after - before : null,
        };
      }),
    };
  }
}
