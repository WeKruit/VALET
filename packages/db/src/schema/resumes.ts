import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const resumeStatusEnum = pgEnum("resume_status", [
  "uploading",
  "parsing",
  "parsed",
  "parse_failed",
]);

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    fileKey: varchar("file_key", { length: 500 }).notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    status: resumeStatusEnum("status").default("uploading").notNull(),
    parsedData: jsonb("parsed_data"),
    parsingConfidence: real("parsing_confidence"),
    rawText: text("raw_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_resumes_user_id").on(table.userId),
    index("idx_resumes_user_default").on(table.userId, table.isDefault),
  ],
);
