import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const mailboxCredentials = pgTable(
  "mailbox_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    emailAddress: text("email_address").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    accessMode: text("access_mode").notNull(),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    status: text("status").default("active").notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("idx_mailbox_credentials_user_id").on(table.userId)],
);
