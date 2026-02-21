/**
 * @deprecated This table is no longer used. Secrets are now managed via shared
 * SSH keys stored in GitHub Secrets and deployed to EC2 instances via CI/CD.
 * Kept for data preservation only. See core-docs/architecture/08-secrets-simplified.md.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sandboxes } from "./sandboxes.js";
import { users } from "./users.js";

/** @deprecated */
export const secretTypeEnum = pgEnum("secret_type", [
  "ssh_key",
  "env_vars",
  "api_key",
]);

/** @deprecated */
export const sandboxSecrets = pgTable(
  "sandbox_secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sandboxId: uuid("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    secretType: secretTypeEnum("secret_type").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    unique("uq_sandbox_secret_type").on(table.sandboxId, table.secretType),
    index("idx_sandbox_secrets_sandbox_id").on(table.sandboxId),
  ],
);
