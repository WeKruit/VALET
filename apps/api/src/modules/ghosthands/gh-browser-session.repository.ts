import { eq, and, desc } from "drizzle-orm";
import { ghBrowserSessions, type Database } from "@valet/db";

export interface GhSessionRecord {
  id: string;
  userId: string | null;
  domain: string | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class GhBrowserSessionRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByUserId(userId: string): Promise<GhSessionRecord[]> {
    const rows = await this.db
      .select({
        id: ghBrowserSessions.id,
        userId: ghBrowserSessions.userId,
        domain: ghBrowserSessions.domain,
        expiresAt: ghBrowserSessions.expiresAt,
        lastUsedAt: ghBrowserSessions.lastUsedAt,
        createdAt: ghBrowserSessions.createdAt,
        updatedAt: ghBrowserSessions.updatedAt,
      })
      .from(ghBrowserSessions)
      .where(eq(ghBrowserSessions.userId, userId))
      .orderBy(desc(ghBrowserSessions.lastUsedAt));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      domain: r.domain,
      expiresAt: r.expiresAt,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async deleteByUserAndDomain(userId: string, domain: string): Promise<boolean> {
    const rows = await this.db
      .delete(ghBrowserSessions)
      .where(and(eq(ghBrowserSessions.userId, userId), eq(ghBrowserSessions.domain, domain)))
      .returning({ id: ghBrowserSessions.id });

    return rows.length > 0;
  }

  async deleteAllByUser(userId: string): Promise<number> {
    const rows = await this.db
      .delete(ghBrowserSessions)
      .where(eq(ghBrowserSessions.userId, userId))
      .returning({ id: ghBrowserSessions.id });

    return rows.length;
  }
}
