import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * GhostHands automation jobs table.
 * This table is OWNED by GhostHands (created externally), but VALET
 * reads/writes it to keep job status in sync with the tasks table.
 *
 * DO NOT create migrations for this table — it already exists in the DB.
 */
export const ghAutomationJobs = pgTable(
  "gh_automation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    userId: uuid("user_id"),
    createdBy: varchar("created_by", { length: 255 }),
    jobType: varchar("job_type", { length: 100 }),
    targetUrl: text("target_url"),
    taskDescription: text("task_description"),
    inputData: jsonb("input_data"),
    priority: integer("priority").default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    maxRetries: integer("max_retries").default(3),
    retryCount: integer("retry_count").default(0),
    timeoutSeconds: integer("timeout_seconds"),
    status: varchar("status", { length: 50 }).default("queued").notNull(),
    statusMessage: text("status_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
    workerId: varchar("worker_id", { length: 255 }),
    manualId: uuid("manual_id"),
    engineType: varchar("engine_type", { length: 100 }),
    resultData: jsonb("result_data"),
    resultSummary: text("result_summary"),
    errorCode: varchar("error_code", { length: 100 }),
    errorDetails: jsonb("error_details"),
    screenshotUrls: jsonb("screenshot_urls"),
    artifactUrls: jsonb("artifact_urls"),
    metadata: jsonb("metadata"),
    tags: jsonb("tags"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    actionCount: integer("action_count"),
    totalTokens: bigint("total_tokens", { mode: "number" }),
    llmCostCents: integer("llm_cost_cents"),
    targetWorkerId: text("target_worker_id"),
    callbackUrl: text("callback_url"),
    valetTaskId: text("valet_task_id"),
    interactionType: text("interaction_type"),
    interactionData: jsonb("interaction_data"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    executionMode: text("execution_mode"),
    browserMode: text("browser_mode"),
    finalMode: text("final_mode"),
  },
  (table) => [
    index("idx_gh_jobs_status").on(table.status),
    index("idx_gh_jobs_valet_task_id").on(table.valetTaskId),
    index("idx_gh_jobs_user_id").on(table.userId),
  ],
);
