import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tasks } from "./tasks";

export const applicationResults = pgTable(
  "application_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fieldName: varchar("field_name", { length: 255 }).notNull(),
    fieldType: varchar("field_type", { length: 50 }).notNull(),
    value: text("value"),
    source: varchar("source", { length: 50 }).notNull(),
    confidence: real("confidence").notNull(),
    qaBankEntryId: uuid("qa_bank_entry_id"),
    userOverridden: boolean("user_overridden").default(false).notNull(),
    metadata: jsonb("metadata").default({}),
    filledAt: timestamp("filled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_application_results_task_id").on(table.taskId),
  ],
);
