import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const earlyAccessSubmissions = pgTable("early_access_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  source: varchar("source", { length: 50 }).notNull().default("landing_page"),
  referralCode: varchar("referral_code", { length: 100 }),
  referredByUserId: uuid("referred_by_user_id").references(() => users.id),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  rewardIssuedAt: timestamp("reward_issued_at", { withTimezone: true }),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  emailStatus: varchar("email_status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
