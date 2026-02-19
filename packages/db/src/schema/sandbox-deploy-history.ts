import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sandboxes } from "./sandboxes.js";
import { users } from "./users.js";

export const sandboxDeployHistory = pgTable(
  "sandbox_deploy_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sandboxId: uuid("sandbox_id").references(() => sandboxes.id, {
      onDelete: "set null",
    }),
    imageTag: varchar("image_tag", { length: 255 }).notNull(),
    commitSha: varchar("commit_sha", { length: 40 }),
    commitMessage: text("commit_message"),
    branch: varchar("branch", { length: 255 }),
    environment: varchar("environment", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    triggeredBy: uuid("triggered_by").references(() => users.id, {
      onDelete: "set null",
    }),
    deployStartedAt: timestamp("deploy_started_at", { withTimezone: true }),
    deployCompletedAt: timestamp("deploy_completed_at", { withTimezone: true }),
    deployDurationMs: integer("deploy_duration_ms"),
    rollbackOf: uuid("rollback_of"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_deploy_history_sandbox_id").on(table.sandboxId),
    index("idx_deploy_history_env").on(table.environment),
    index("idx_deploy_history_status").on(table.status),
    index("idx_deploy_history_created_at").on(table.createdAt),
  ],
);
