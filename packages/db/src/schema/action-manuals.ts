import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { platformEnum } from "./tasks.js";

export const actionManuals = pgTable(
  "action_manuals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    urlPattern: text("url_pattern").notNull(),
    platform: platformEnum("platform").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    version: integer("version").default(1).notNull(),
    healthScore: real("health_score").default(1.0).notNull(),
    totalRuns: integer("total_runs").default(0).notNull(),
    successCount: integer("success_count").default(0).notNull(),
    failureCount: integer("failure_count").default(0).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_manuals_platform").on(table.platform),
    index("idx_manuals_health").on(table.healthScore),
  ],
);

export const manualSteps = pgTable(
  "manual_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    manualId: uuid("manual_id")
      .notNull()
      .references(() => actionManuals.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    selector: text("selector"),
    fallbackSelector: text("fallback_selector"),
    value: text("value"),
    description: text("description").notNull(),
    elementType: varchar("element_type", { length: 50 }),
    waitAfterMs: integer("wait_after_ms").default(500),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_steps_manual").on(table.manualId),
  ],
);
