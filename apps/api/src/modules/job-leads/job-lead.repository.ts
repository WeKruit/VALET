import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import { jobLeads, type Database } from "@valet/db";

export class JobLeadRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByUserId(
    userId: string,
    opts: {
      status?: string;
      platform?: string;
      search?: string;
      limit: number;
      offset: number;
    },
  ) {
    const conditions = [eq(jobLeads.userId, userId)];

    if (opts.status) {
      conditions.push(eq(jobLeads.status, opts.status));
    }
    if (opts.platform) {
      conditions.push(eq(jobLeads.platform, opts.platform));
    }
    if (opts.search) {
      const pattern = `%${opts.search}%`;
      conditions.push(or(ilike(jobLeads.title, pattern), ilike(jobLeads.company, pattern))!);
    }

    const where = and(...conditions);

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(jobLeads)
        .where(where)
        .orderBy(desc(jobLeads.createdAt))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobLeads)
        .where(where),
    ]);

    return { data: rows, total: countResult[0]?.count ?? 0 };
  }

  async findById(id: string, userId: string) {
    const rows = await this.db
      .select()
      .from(jobLeads)
      .where(and(eq(jobLeads.id, id), eq(jobLeads.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: {
    userId: string;
    jobUrl: string;
    platform: string;
    title: string;
    company: string;
    location?: string;
    source: string;
    matchScore?: number;
  }) {
    const rows = await this.db
      .insert(jobLeads)
      .values({
        userId: data.userId,
        jobUrl: data.jobUrl,
        platform: data.platform,
        title: data.title,
        company: data.company,
        location: data.location ?? null,
        source: data.source,
        matchScore: data.matchScore ?? null,
      })
      .returning();
    return rows[0]!;
  }

  async update(
    id: string,
    data: {
      title?: string;
      company?: string;
      location?: string | null;
      status?: string;
      taskId?: string | null;
    },
  ) {
    const rows = await this.db.update(jobLeads).set(data).where(eq(jobLeads.id, id)).returning();
    return rows[0] ?? null;
  }

  async delete(id: string) {
    await this.db.delete(jobLeads).where(eq(jobLeads.id, id));
  }

  async findByUrl(userId: string, url: string) {
    const rows = await this.db
      .select()
      .from(jobLeads)
      .where(and(eq(jobLeads.userId, userId), eq(jobLeads.jobUrl, url)))
      .limit(1);
    return rows[0] ?? null;
  }
}
