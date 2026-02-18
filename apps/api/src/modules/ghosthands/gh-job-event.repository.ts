import { eq, asc } from "drizzle-orm";
import { ghJobEvents, type Database } from "@valet/db";

export interface GhJobEventRecord {
  id: string;
  jobId: string | null;
  eventType: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  actor: string | null;
  createdAt: Date;
}

export class GhJobEventRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByJobId(jobId: string): Promise<GhJobEventRecord[]> {
    const rows = await this.db
      .select()
      .from(ghJobEvents)
      .where(eq(ghJobEvents.jobId, jobId))
      .orderBy(asc(ghJobEvents.createdAt));

    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      eventType: r.eventType,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      message: r.message,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      actor: r.actor,
      createdAt: r.createdAt,
    }));
  }
}
