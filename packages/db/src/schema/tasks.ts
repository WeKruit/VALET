import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { resumes } from "./resumes.js";
import { browserProfiles } from "./browser-profiles.js";

export const taskStatusEnum = pgEnum("task_status", [
  "created",
  "queued",
  "in_progress",
  "waiting_human",
  "completed",
  "failed",
  "cancelled",
]);

export const platformEnum = pgEnum("platform", [
  "linkedin",
  "greenhouse",
  "lever",
  "workday",
  "unknown",
]);

export const applicationModeEnum = pgEnum("application_mode", [
  "copilot",
  "autopilot",
]);

export const externalStatusEnum = pgEnum("external_status", [
  "applied",
  "viewed",
  "interview",
  "rejected",
  "offer",
  "ghosted",
]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobUrl: text("job_url").notNull(),
    platform: platformEnum("platform").default("unknown").notNull(),
    status: taskStatusEnum("status").default("created").notNull(),
    mode: applicationModeEnum("mode").default("copilot").notNull(),
    resumeId: uuid("resume_id").references(() => resumes.id, { onDelete: "set null" }),
    jobTitle: varchar("job_title", { length: 500 }),
    companyName: varchar("company_name", { length: 255 }),
    jobLocation: varchar("job_location", { length: 255 }),
    externalStatus: externalStatusEnum("external_status"),
    progress: integer("progress").default(0).notNull(),
    currentStep: varchar("current_step", { length: 100 }),
    confidenceScore: real("confidence_score"),
    matchScore: real("match_score"),
    fieldsFilled: integer("fields_filled").default(0).notNull(),
    durationSeconds: integer("duration_seconds"),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0).notNull(),
    workflowRunId: varchar("workflow_run_id", { length: 255 }),
    browserProfileId: uuid("browser_profile_id").references(() => browserProfiles.id, { onDelete: "set null" }),
    screenshots: jsonb("screenshots").default({}),
    llmUsage: jsonb("llm_usage").default({}),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_tasks_user_status").on(table.userId, table.status),
    index("idx_tasks_user_created").on(table.userId, table.createdAt),
    index("idx_tasks_status").on(table.status),
  ],
);
