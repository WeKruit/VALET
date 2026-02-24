import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

export const earlyAccessSubmissions = pgTable("early_access_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  source: varchar("source", { length: 50 }).notNull().default("landing_page"),
  referralCode: varchar("referral_code", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
