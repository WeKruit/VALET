import { eq, and, desc } from "drizzle-orm";
import { consentRecords, type Database } from "@valet/db";
import type { ConsentType, ConsentRecord } from "@valet/shared/schemas";

export class ConsentService {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async recordConsent(data: {
    userId: string;
    type: ConsentType;
    version: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<ConsentRecord> {
    const rows = await this.db
      .insert(consentRecords)
      .values({
        userId: data.userId,
        type: data.type,
        version: data.version,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      })
      .returning();
    return rows[0] as ConsentRecord;
  }

  async getByUser(userId: string): Promise<ConsentRecord[]> {
    const rows = await this.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, userId))
      .orderBy(desc(consentRecords.createdAt));
    return rows as ConsentRecord[];
  }

  async checkConsent(
    userId: string,
    type: ConsentType,
    version: string,
  ): Promise<{ accepted: boolean; acceptedAt: Date | null }> {
    const rows = await this.db
      .select()
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.userId, userId),
          eq(consentRecords.type, type),
          eq(consentRecords.version, version),
        ),
      )
      .orderBy(desc(consentRecords.createdAt))
      .limit(1);

    if (rows.length === 0) {
      return { accepted: false, acceptedAt: null };
    }

    return { accepted: true, acceptedAt: rows[0]!.createdAt };
  }
}
