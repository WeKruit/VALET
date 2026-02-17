import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * GhostHands job events table.
 * Stores status transition history for automation jobs.
 * Table is OWNED by GhostHands — VALET reads it for job timeline display.
 *
 * DO NOT create migrations for this table — it already exists in the DB.
 */
export const ghJobEvents = pgTable(
  "gh_job_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id"),
    eventType: varchar("event_type", { length: 100 }),
    fromStatus: varchar("from_status", { length: 50 }),
    toStatus: varchar("to_status", { length: 50 }),
    message: text("message"),
    metadata: jsonb("metadata"),
    actor: varchar("actor", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_gh_job_events_job_id").on(table.jobId)],
);
