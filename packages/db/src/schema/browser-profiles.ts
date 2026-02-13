import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const profileStatusEnum = pgEnum("profile_status", [
  "available",
  "in_use",
  "error",
  "retired",
]);

export const browserProfiles = pgTable(
  "browser_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(),
    adspowerProfileId: varchar("adspower_profile_id", { length: 100 }).notNull().unique(),
    proxyBindingId: uuid("proxy_binding_id"),
    fingerprintConfig: jsonb("fingerprint_config").notNull(),
    status: profileStatusEnum("status").default("available").notNull(),
    sessionHealthy: boolean("session_healthy").default(false).notNull(),
    totalTasksCompleted: integer("total_tasks_completed").default(0).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_browser_profiles_user_platform").on(table.userId, table.platform),
    index("idx_browser_profiles_status").on(table.status),
  ],
);
