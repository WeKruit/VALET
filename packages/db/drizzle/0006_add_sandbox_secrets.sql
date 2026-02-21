-- DEPRECATED: sandbox_secrets table is no longer used.
-- Secrets are now managed via shared SSH keys stored in GitHub Secrets
-- and deployed to EC2 instances via CI/CD. This table is kept for data
-- preservation only. See core-docs/architecture/08-secrets-simplified.md.
--
-- Original purpose: encrypted secret storage for sandbox instances

-- Enable pgcrypto for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE "secret_type" AS ENUM ('ssh_key', 'env_vars', 'api_key');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "sandbox_secrets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sandbox_id" uuid NOT NULL REFERENCES "sandboxes"("id") ON DELETE CASCADE,
  "secret_type" "secret_type" NOT NULL,
  "encrypted_value" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "uq_sandbox_secret_type" UNIQUE ("sandbox_id", "secret_type")
);

CREATE INDEX IF NOT EXISTS "idx_sandbox_secrets_sandbox_id" ON "sandbox_secrets" ("sandbox_id");

COMMENT ON TABLE "sandbox_secrets" IS 'Encrypted secrets associated with sandbox instances';
COMMENT ON COLUMN "sandbox_secrets"."encrypted_value" IS 'PGP-encrypted secret value (never expose in API responses)';
COMMENT ON COLUMN "sandbox_secrets"."expires_at" IS 'Optional expiration timestamp for secret rotation';
