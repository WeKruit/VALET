import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const qaUsageModeEnum = pgEnum("qa_usage_mode", [
  "always_use",
  "ask_each_time",
  "decline_to_answer",
]);

export const answerSourceEnum = pgEnum("answer_source", [
  "user_input",
  "resume_inferred",
  "application_learned",
]);

export const qaBank = pgTable(
  "qa_bank",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 50 }).notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    usageMode: qaUsageModeEnum("usage_mode").default("always_use").notNull(),
    source: answerSourceEnum("source").default("user_input").notNull(),
    timesUsed: integer("times_used").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_qa_bank_user_id").on(table.userId),
    index("idx_qa_bank_user_category").on(table.userId, table.category),
  ],
);
