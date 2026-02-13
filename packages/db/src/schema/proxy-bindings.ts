import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const proxyStatusEnum = pgEnum("proxy_status", [
  "active",
  "blocked",
  "expired",
]);

export const proxyBindings = pgTable(
  "proxy_bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 50 }).default("iproyal").notNull(),
    proxyType: varchar("proxy_type", { length: 20 }).default("socks5").notNull(),
    hostname: varchar("hostname", { length: 255 }).notNull(),
    port: integer("port").notNull(),
    username: varchar("username", { length: 255 }),
    encryptedPassword: varchar("encrypted_password", { length: 500 }),
    country: varchar("country", { length: 10 }).default("US").notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    sessionId: varchar("session_id", { length: 255 }),
    status: proxyStatusEnum("status").default("active").notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_proxy_bindings_status_country").on(table.status, table.country),
  ],
);
