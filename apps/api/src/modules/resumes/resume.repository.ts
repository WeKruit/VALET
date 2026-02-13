import { eq, and, desc } from "drizzle-orm";
import { resumes, type Database } from "@valet/db";

export class ResumeRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findById(id: string, userId: string) {
    const rows = await this.db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByUserId(userId: string) {
    return this.db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt));
  }

  async create(data: {
    userId: string;
    filename: string;
    fileSizeBytes: number;
    mimeType: string;
    storageKey: string;
  }) {
    const rows = await this.db
      .insert(resumes)
      .values({
        userId: data.userId,
        filename: data.filename,
        fileSizeBytes: data.fileSizeBytes,
        mimeType: data.mimeType,
        fileKey: data.storageKey,
        status: "parsing",
      })
      .returning();
    return rows[0]!;
  }

  async update(id: string, data: Record<string, unknown>) {
    const rows = await this.db
      .update(resumes)
      .set(data)
      .where(eq(resumes.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string) {
    await this.db.delete(resumes).where(eq(resumes.id, id));
  }

  async setDefault(id: string, userId: string) {
    // First unset all defaults for this user
    await this.db
      .update(resumes)
      .set({ isDefault: false })
      .where(eq(resumes.userId, userId));

    // Then set the target resume as default
    const rows = await this.db
      .update(resumes)
      .set({ isDefault: true })
      .where(and(eq(resumes.id, id), eq(resumes.userId, userId)))
      .returning();
    return rows[0] ?? null;
  }
}
