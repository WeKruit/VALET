import { pgTable, uuid, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { resumes } from "./resumes.js";
import { tasks } from "./tasks.js";

export const resumeVariants = pgTable(
  "resume_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    baseResumeId: uuid("base_resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    jobUrl: text("job_url").notNull(),
    variantData: jsonb("variant_data").notNull(),
    diffData: jsonb("diff_data").notNull(),
    matchScoreBefore: integer("match_score_before"),
    matchScoreAfter: integer("match_score_after"),
    keywordGaps: jsonb("keyword_gaps"),
    rephraseMode: text("rephrase_mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_resume_variants_user_resume").on(table.userId, table.baseResumeId)],
);
