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

export const sandboxAuditLogs = pgTable(
  "sandbox_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sandboxId: uuid("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 50 }).notNull(),
    details: jsonb("details").default({}),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    result: varchar("result", { length: 20 }).default("success"),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sandbox_audit_sandbox_id").on(table.sandboxId),
    index("idx_sandbox_audit_user_id").on(table.userId),
    index("idx_sandbox_audit_action").on(table.action),
    index("idx_sandbox_audit_created_at").on(table.createdAt),
  ],
);
