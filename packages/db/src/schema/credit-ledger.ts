import { pgTable, uuid, varchar, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  delta: integer("delta").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  reason: varchar("reason", { length: 30 }).notNull(),
  description: text("description"),
  referenceType: varchar("reference_type", { length: 30 }),
  referenceId: uuid("reference_id"),
  idempotencyKey: varchar("idempotency_key", { length: 100 }).unique(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
