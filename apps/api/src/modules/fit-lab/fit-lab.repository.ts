import { eq, and, desc } from "drizzle-orm";
import { resumeVariants, type Database } from "@valet/db";

export class FitLabRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findById(id: string, userId: string) {
    const rows = await this.db
      .select()
      .from(resumeVariants)
      .where(and(eq(resumeVariants.id, id), eq(resumeVariants.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByUserId(userId: string) {
    return this.db
      .select()
      .from(resumeVariants)
      .where(eq(resumeVariants.userId, userId))
      .orderBy(desc(resumeVariants.createdAt));
  }

  async findByResumeId(userId: string, resumeId: string) {
    return this.db
      .select()
      .from(resumeVariants)
      .where(and(eq(resumeVariants.userId, userId), eq(resumeVariants.baseResumeId, resumeId)))
      .orderBy(desc(resumeVariants.createdAt));
  }

  async create(data: {
    userId: string;
    baseResumeId: string;
    taskId?: string | null;
    jobUrl: string;
    variantData: Record<string, unknown>;
    diffData: Record<string, unknown>;
    matchScoreBefore?: number | null;
    matchScoreAfter?: number | null;
    keywordGaps?: unknown[] | null;
    rephraseMode: string;
  }) {
    const rows = await this.db
      .insert(resumeVariants)
      .values({
        userId: data.userId,
        baseResumeId: data.baseResumeId,
        taskId: data.taskId ?? null,
        jobUrl: data.jobUrl,
        variantData: data.variantData,
        diffData: data.diffData,
        matchScoreBefore: data.matchScoreBefore ?? null,
        matchScoreAfter: data.matchScoreAfter ?? null,
        keywordGaps: data.keywordGaps ?? null,
        rephraseMode: data.rephraseMode,
      })
      .returning();
    return rows[0]!;
  }
}
