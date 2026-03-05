import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { tasks } from "./tasks.js";

export const jobLeads = pgTable(
  "job_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobUrl: text("job_url").notNull(),
    platform: text("platform").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    matchScore: integer("match_score"),
    source: text("source").notNull(),
    status: text("status").default("saved").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_job_leads_user_status").on(table.userId, table.status)],
);
