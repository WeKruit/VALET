import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * GhostHands browser sessions table.
 * Stores persistent login sessions (encrypted cookies) per user per domain.
 * Table is OWNED by GhostHands — VALET reads it for the sessions UI.
 *
 * DO NOT create migrations for this table — it already exists in the DB.
 */
export const ghBrowserSessions = pgTable(
  "gh_browser_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id"),
    domain: text("domain"),
    sessionData: text("session_data"),
    encryptionKeyId: text("encryption_key_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_gh_sessions_user_id").on(table.userId),
    index("idx_gh_sessions_domain").on(table.domain),
  ],
);
