import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { sandboxes } from "./sandboxes.js";

export const userSandboxes = pgTable(
  "user_sandboxes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sandboxId: uuid("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("uq_user_sandboxes_user").on(table.userId),
    index("idx_user_sandboxes_user_id").on(table.userId),
    index("idx_user_sandboxes_sandbox_id").on(table.sandboxId),
  ],
);
