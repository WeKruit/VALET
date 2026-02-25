import { eq, sql, ilike, or, desc } from "drizzle-orm";
import { earlyAccessSubmissions, type Database } from "@valet/db";

/** Escape SQL LIKE/ILIKE wildcards so user input is treated as literal text. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

export class EarlyAccessRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByEmail(email: string) {
    const rows = await this.db
      .select()
      .from(earlyAccessSubmissions)
      .where(eq(earlyAccessSubmissions.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: { email: string; name: string; source?: string; referralCode?: string }) {
    const rows = await this.db
      .insert(earlyAccessSubmissions)
      .values({
        email: data.email,
        name: data.name,
        source: data.source ?? "landing_page",
        referralCode: data.referralCode ?? null,
      })
      .returning();
    return rows[0]!;
  }

  async countAll(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(earlyAccessSubmissions);
    return Number(result[0]?.count ?? 0);
  }

  async getById(id: string) {
    const rows = await this.db
      .select()
      .from(earlyAccessSubmissions)
      .where(eq(earlyAccessSubmissions.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async list(opts: { page: number; limit: number; emailStatus?: string; search?: string }) {
    const { page, limit, emailStatus, search } = opts;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (emailStatus) {
      conditions.push(eq(earlyAccessSubmissions.emailStatus, emailStatus));
    }
    if (search) {
      const safeSearch = escapeLike(search);
      conditions.push(
        or(
          ilike(earlyAccessSubmissions.email, `%${safeSearch}%`),
          ilike(earlyAccessSubmissions.name, `%${safeSearch}%`),
        )!,
      );
    }

    const whereClause =
      conditions.length > 0
        ? conditions.length === 1
          ? conditions[0]!
          : sql`${conditions[0]} AND ${conditions[1]}`
        : undefined;

    const [items, countResult] = await Promise.all([
      whereClause
        ? this.db
            .select()
            .from(earlyAccessSubmissions)
            .where(whereClause)
            .orderBy(desc(earlyAccessSubmissions.createdAt))
            .offset(offset)
            .limit(limit)
        : this.db
            .select()
            .from(earlyAccessSubmissions)
            .orderBy(desc(earlyAccessSubmissions.createdAt))
            .offset(offset)
            .limit(limit),
      whereClause
        ? this.db
            .select({ count: sql<number>`count(*)` })
            .from(earlyAccessSubmissions)
            .where(whereClause)
        : this.db.select({ count: sql<number>`count(*)` }).from(earlyAccessSubmissions),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateEmailStatus(id: string, status: string, sentAt?: Date) {
    const rows = await this.db
      .update(earlyAccessSubmissions)
      .set({
        emailStatus: status,
        ...(sentAt ? { emailSentAt: sentAt } : {}),
      })
      .where(eq(earlyAccessSubmissions.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async deleteById(id: string) {
    const rows = await this.db
      .delete(earlyAccessSubmissions)
      .where(eq(earlyAccessSubmissions.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async getStats() {
    const result = await this.db
      .select({
        emailStatus: earlyAccessSubmissions.emailStatus,
        count: sql<number>`count(*)`,
      })
      .from(earlyAccessSubmissions)
      .groupBy(earlyAccessSubmissions.emailStatus);

    let total = 0;
    const byStatus: Record<string, number> = {};
    for (const row of result) {
      const count = Number(row.count);
      byStatus[row.emailStatus] = count;
      total += count;
    }

    return { total, byStatus };
  }
}
