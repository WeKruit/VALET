import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { tasks } from "./tasks.js";
import { users } from "./users.js";

export const submissionProofs = pgTable(
  "submission_proofs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resumeVariantId: uuid("resume_variant_id"),
    screenshots: jsonb("screenshots"),
    answers: jsonb("answers"),
    timeline: jsonb("timeline"),
    externalStatus: text("external_status"),
    confirmationData: jsonb("confirmation_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_submission_proofs_task_id").on(table.taskId),
    index("idx_submission_proofs_user_id").on(table.userId),
  ],
);
