import { eq, and, count, sql, asc } from "drizzle-orm";
import { userSandboxes, sandboxes, users, type Database } from "@valet/db";

export interface UserSandboxAssignment {
  id: string;
  userId: string;
  sandboxId: string;
  assignedAt: Date;
  assignedBy: string | null;
}

export interface UserSandboxAssignmentWithNames extends UserSandboxAssignment {
  userName: string | null;
  userEmail: string | null;
  sandboxName: string | null;
}

export class UserSandboxRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findByUserId(userId: string): Promise<UserSandboxAssignment | null> {
    const rows = await this.db
      .select()
      .from(userSandboxes)
      .where(eq(userSandboxes.userId, userId))
      .limit(1);
    const row = rows[0];
    return row ? (row as UserSandboxAssignment) : null;
  }

  async findBySandboxId(sandboxId: string): Promise<UserSandboxAssignment[]> {
    const rows = await this.db
      .select()
      .from(userSandboxes)
      .where(eq(userSandboxes.sandboxId, sandboxId));
    return rows as UserSandboxAssignment[];
  }

  async findAll(sandboxId?: string): Promise<UserSandboxAssignmentWithNames[]> {
    const conditions = sandboxId ? eq(userSandboxes.sandboxId, sandboxId) : undefined;

    const rows = await this.db
      .select({
        id: userSandboxes.id,
        userId: userSandboxes.userId,
        sandboxId: userSandboxes.sandboxId,
        assignedAt: userSandboxes.assignedAt,
        assignedBy: userSandboxes.assignedBy,
        userName: users.name,
        userEmail: users.email,
        sandboxName: sandboxes.name,
      })
      .from(userSandboxes)
      .leftJoin(users, eq(userSandboxes.userId, users.id))
      .leftJoin(sandboxes, eq(userSandboxes.sandboxId, sandboxes.id))
      .where(conditions);

    return rows as UserSandboxAssignmentWithNames[];
  }

  /**
   * Assign (or reassign) a user to a sandbox. Uses upsert on the UNIQUE(user_id) constraint.
   */
  async assign(
    userId: string,
    sandboxId: string,
    assignedBy?: string,
  ): Promise<UserSandboxAssignment> {
    const rows = await this.db
      .insert(userSandboxes)
      .values({
        userId,
        sandboxId,
        assignedBy: assignedBy ?? null,
      })
      .onConflictDoUpdate({
        target: userSandboxes.userId,
        set: {
          sandboxId,
          assignedAt: new Date(),
          assignedBy: assignedBy ?? null,
        },
      })
      .returning();
    return rows[0] as UserSandboxAssignment;
  }

  async unassign(userId: string): Promise<boolean> {
    const result = await this.db
      .delete(userSandboxes)
      .where(eq(userSandboxes.userId, userId))
      .returning({ id: userSandboxes.id });
    return result.length > 0;
  }

  async unassignBySandboxId(sandboxId: string): Promise<number> {
    const result = await this.db
      .delete(userSandboxes)
      .where(eq(userSandboxes.sandboxId, sandboxId))
      .returning({ id: userSandboxes.id });
    return result.length;
  }

  async countBySandbox(sandboxId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(userSandboxes)
      .where(eq(userSandboxes.sandboxId, sandboxId));
    return result[0]?.count ?? 0;
  }

  /**
   * Find the best available sandbox for auto-assignment.
   * Filters to active + healthy sandboxes with capacity headroom.
   * Orders by lowest load ratio (fewest assignments relative to capacity).
   */
  async findBestAvailableSandbox(): Promise<string | null> {
    const assignmentCounts = this.db
      .select({
        sandboxId: userSandboxes.sandboxId,
        assignmentCount: count().as("assignment_count"),
      })
      .from(userSandboxes)
      .groupBy(userSandboxes.sandboxId)
      .as("ac");

    const rows = await this.db
      .select({
        id: sandboxes.id,
        capacity: sandboxes.capacity,
        assignmentCount: sql<number>`COALESCE(${assignmentCounts.assignmentCount}, 0)`.as(
          "current_assignments",
        ),
      })
      .from(sandboxes)
      .leftJoin(assignmentCounts, eq(sandboxes.id, assignmentCounts.sandboxId))
      .where(and(eq(sandboxes.status, "active"), eq(sandboxes.healthStatus, "healthy")))
      .orderBy(
        asc(sql`COALESCE(${assignmentCounts.assignmentCount}, 0)::float / ${sandboxes.capacity}`),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    // Check capacity: assignment count must be less than capacity
    const currentAssignments = Number(row.assignmentCount);
    if (currentAssignments >= row.capacity) return null;

    return row.id;
  }
}
