import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tasks } from "./tasks";

export const applicationFields = pgTable(
  "application_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fieldName: varchar("field_name", { length: 255 }).notNull(),
    fieldValue: text("field_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_application_fields_application_id").on(table.applicationId),
  ],
);
