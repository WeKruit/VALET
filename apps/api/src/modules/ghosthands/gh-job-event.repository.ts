import { eq, and, asc, desc } from "drizzle-orm";
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

  /**
   * Returns the most recent progress_update event for a job.
   * Used to compute progress from gh_job_events (single source of truth)
   * instead of duplicating progress data in the tasks table.
   *
   * @see WEK-71 progress dedup
   */
  async findLatestProgressEvent(jobId: string): Promise<GhJobEventRecord | null> {
    const rows = await this.db
      .select()
      .from(ghJobEvents)
      .where(and(eq(ghJobEvents.jobId, jobId), eq(ghJobEvents.eventType, "progress_update")))
      .orderBy(desc(ghJobEvents.createdAt))
      .limit(1);

    const r = rows[0];
    if (!r) return null;

    return {
      id: r.id,
      jobId: r.jobId,
      eventType: r.eventType,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      message: r.message,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
      actor: r.actor,
      createdAt: r.createdAt,
    };
  }
}
