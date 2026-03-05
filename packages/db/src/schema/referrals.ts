import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => users.id),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => users.id),
    referralCode: varchar("referral_code", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    rewardCreditsIssued: integer("reward_credits_issued").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_referrals_referred_user").on(table.referredUserId),
    unique("uq_referrals_pair").on(table.referrerUserId, table.referredUserId),
  ],
);
