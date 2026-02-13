import { eq, and, desc } from "drizzle-orm";
import { qaBank, type Database } from "@valet/db";
import type {
  QaCategory,
  QaUsageMode,
  AnswerSource,
  QaEntry,
} from "@valet/shared/schemas";

export type QaEntryRecord = QaEntry;

export class QaBankRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByUserId(
    userId: string,
    category?: string,
  ): Promise<QaEntryRecord[]> {
    const conditions = [eq(qaBank.userId, userId)];
    if (category) {
      conditions.push(eq(qaBank.category, category as QaCategory));
    }

    const rows = await this.db
      .select()
      .from(qaBank)
      .where(and(...conditions))
      .orderBy(desc(qaBank.updatedAt));
    return rows as QaEntryRecord[];
  }

  async findById(
    id: string,
    userId: string,
  ): Promise<QaEntryRecord | null> {
    const rows = await this.db
      .select()
      .from(qaBank)
      .where(and(eq(qaBank.id, id), eq(qaBank.userId, userId)))
      .limit(1);
    return (rows[0] as QaEntryRecord | undefined) ?? null;
  }

  async findByQuestion(
    userId: string,
    question: string,
  ): Promise<QaEntryRecord | null> {
    const rows = await this.db
      .select()
      .from(qaBank)
      .where(and(eq(qaBank.userId, userId), eq(qaBank.question, question)))
      .limit(1);
    return (rows[0] as QaEntryRecord | undefined) ?? null;
  }

  async create(data: {
    userId: string;
    category: QaCategory;
    question: string;
    answer: string;
    usageMode: QaUsageMode;
    source: AnswerSource;
  }): Promise<QaEntryRecord> {
    const rows = await this.db
      .insert(qaBank)
      .values({
        userId: data.userId,
        category: data.category,
        question: data.question,
        answer: data.answer,
        usageMode: data.usageMode,
        source: data.source,
      })
      .returning();
    return rows[0] as QaEntryRecord;
  }

  async update(
    id: string,
    data: { answer?: string; usageMode?: QaUsageMode },
  ): Promise<QaEntryRecord | null> {
    const rows = await this.db
      .update(qaBank)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(qaBank.id, id))
      .returning();
    return (rows[0] as QaEntryRecord | undefined) ?? null;
  }

  async delete(id: string) {
    await this.db.delete(qaBank).where(eq(qaBank.id, id));
  }
}
