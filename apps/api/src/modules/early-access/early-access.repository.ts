import { eq, sql } from "drizzle-orm";
import { earlyAccessSubmissions, type Database } from "@valet/db";

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
}
