import { eq, count, desc } from "drizzle-orm";
import { sandboxDeployHistory, type Database } from "@valet/db";

export interface DeployHistoryRecord {
  id: string;
  sandboxId: string | null;
  imageTag: string;
  commitSha: string | null;
  commitMessage: string | null;
  branch: string | null;
  environment: string;
  status: string;
  triggeredBy: string | null;
  deployStartedAt: Date | null;
  deployCompletedAt: Date | null;
  deployDurationMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export class DeployHistoryRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findBySandbox(
    sandboxId: string,
    options: { page: number; pageSize: number },
  ): Promise<{ data: DeployHistoryRecord[]; total: number }> {
    const whereClause = eq(sandboxDeployHistory.sandboxId, sandboxId);

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(sandboxDeployHistory)
        .where(whereClause)
        .orderBy(desc(sandboxDeployHistory.createdAt))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize),
      this.db.select({ count: count() }).from(sandboxDeployHistory).where(whereClause),
    ]);

    return {
      data: data as DeployHistoryRecord[],
      total: totalResult[0]?.count ?? 0,
    };
  }
}
