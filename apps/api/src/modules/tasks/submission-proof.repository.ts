import { eq, and } from "drizzle-orm";
import { submissionProofs, type Database } from "@valet/db";

export interface SubmissionProofRecord {
  id: string;
  taskId: string;
  userId: string;
  resumeVariantId: string | null;
  screenshots: unknown;
  answers: unknown;
  timeline: unknown;
  externalStatus: string | null;
  confirmationData: unknown;
  createdAt: Date;
}

export class SubmissionProofRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByTaskId(taskId: string, userId: string): Promise<SubmissionProofRecord | null> {
    const rows = await this.db
      .select()
      .from(submissionProofs)
      .where(and(eq(submissionProofs.taskId, taskId), eq(submissionProofs.userId, userId)))
      .limit(1);
    return (rows[0] as SubmissionProofRecord | undefined) ?? null;
  }
}
