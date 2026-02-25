import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  subject: varchar("subject", { length: 255 }).notNull(),
  mjmlBody: text("mjml_body").notNull(),
  textBody: text("text_body"),
  variables: jsonb("variables").default([]).$type<Array<{ name: string; required: boolean }>>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
