/**
 * HOTFIX: Repair missing DDL for migrations 0021-0025.
 *
 * These migrations were recorded in __drizzle_migrations (by a prior deploy)
 * but the actual DDL was never executed against the database. The migration
 * runner caught a "duplicate key" error on the journal INSERT and skipped
 * the DDL entirely.
 *
 * This script runs the missing DDL with idempotent guards (IF NOT EXISTS,
 * DO $$ ... END $$) so it is safe to re-run.
 *
 * Usage: DATABASE_DIRECT_URL=... node packages/db/dist/repair-migrations.js
 */
import postgres from "postgres";

const connectionString = process.env["DATABASE_DIRECT_URL"] ?? process.env["DATABASE_URL"];
if (!connectionString) {
  console.error("DATABASE_DIRECT_URL or DATABASE_URL must be set");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1, connect_timeout: 30, idle_timeout: 30 });

async function repair() {
  console.log("Starting migration repair...\n");

  // 0021: Add 'testing' enum value to task_status
  console.log("[0021] Adding 'testing' to task_status enum...");
  await sql.unsafe(`ALTER TYPE "public"."task_status" ADD VALUE IF NOT EXISTS 'testing';`);
  console.log("[0021] Done.\n");

  // 0022: Add auto_stop_owner and last_became_idle_at to sandboxes
  console.log("[0022] Adding auto_stop_owner and last_became_idle_at to sandboxes...");
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE "sandboxes" ADD COLUMN "auto_stop_owner" varchar(16) NOT NULL DEFAULT 'none';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE "sandboxes" ADD COLUMN "last_became_idle_at" timestamptz;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  console.log("[0022] Done.\n");

  // 0023: Create UX chain tables (all use IF NOT EXISTS)
  console.log(
    "[0023] Creating platform_credentials, mailbox_credentials, resume_variants, job_leads, submission_proofs...",
  );
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "platform_credentials" (
      "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "platform" text NOT NULL,
      "domain" text,
      "login_identifier" text NOT NULL,
      "encrypted_secret" text NOT NULL,
      "status" text NOT NULL DEFAULT 'active',
      "last_verified_at" timestamptz,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_platform_credentials_user_platform" ON "platform_credentials" ("user_id", "platform");

    CREATE TABLE IF NOT EXISTS "mailbox_credentials" (
      "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "provider" text NOT NULL,
      "email_address" text NOT NULL,
      "encrypted_secret" text NOT NULL,
      "access_mode" text NOT NULL,
      "two_factor_enabled" boolean NOT NULL DEFAULT false,
      "status" text NOT NULL DEFAULT 'active',
      "last_verified_at" timestamptz,
      "created_at" timestamptz DEFAULT now() NOT NULL,
      "updated_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_mailbox_credentials_user_id" ON "mailbox_credentials" ("user_id");

    CREATE TABLE IF NOT EXISTS "resume_variants" (
      "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "base_resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
      "task_id" uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
      "job_url" text NOT NULL,
      "variant_data" jsonb NOT NULL,
      "diff_data" jsonb NOT NULL,
      "match_score_before" integer,
      "match_score_after" integer,
      "keyword_gaps" jsonb,
      "rephrase_mode" text NOT NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_resume_variants_user_resume" ON "resume_variants" ("user_id", "base_resume_id");

    CREATE TABLE IF NOT EXISTS "job_leads" (
      "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "job_url" text NOT NULL,
      "platform" text NOT NULL,
      "title" text NOT NULL,
      "company" text NOT NULL,
      "location" text,
      "match_score" integer,
      "source" text NOT NULL,
      "status" text NOT NULL DEFAULT 'saved',
      "task_id" uuid REFERENCES "tasks"("id") ON DELETE SET NULL,
      "created_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_job_leads_user_status" ON "job_leads" ("user_id", "status");

    CREATE TABLE IF NOT EXISTS "submission_proofs" (
      "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "resume_variant_id" uuid,
      "screenshots" jsonb,
      "answers" jsonb,
      "timeline" jsonb,
      "external_status" text,
      "confirmation_data" jsonb,
      "created_at" timestamptz DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "idx_submission_proofs_task_id" ON "submission_proofs" ("task_id");
    CREATE INDEX IF NOT EXISTS "idx_submission_proofs_user_id" ON "submission_proofs" ("user_id");
  `);
  console.log("[0023] Done.\n");

  // 0024: Add onboarding_completed_at to users, unique constraint on mailbox_credentials
  console.log("[0024] Adding onboarding_completed_at, mailbox_credentials unique constraint...");
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" TIMESTAMP WITH TIME ZONE;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await sql.unsafe(`
    DELETE FROM "mailbox_credentials" a
      USING "mailbox_credentials" b
      WHERE a.user_id = b.user_id
        AND a.provider = b.provider
        AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id));
  `);
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE "mailbox_credentials"
        ADD CONSTRAINT "uq_mailbox_credentials_user_provider"
        UNIQUE ("user_id", "provider");
    EXCEPTION WHEN duplicate_table THEN NULL;
    END $$;
  `);
  console.log("[0024] Done.\n");

  // 0025: Add referral/credit system columns and tables
  console.log(
    "[0025] Adding referral code, credit balance, referrals table, credit_ledger table...",
  );
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE "users" ADD COLUMN "my_referral_code" VARCHAR(20) UNIQUE;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE "users" ADD COLUMN "credit_balance" INTEGER NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await sql.unsafe(`
    DO $$ BEGIN
      ALTER TABLE "users" ADD COLUMN "trial_credits_expire_at" TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `);
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(my_referral_code);`,
  );

  await sql.unsafe(
    `ALTER TABLE early_access_submissions ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id);`,
  );
  await sql.unsafe(
    `ALTER TABLE early_access_submissions ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;`,
  );
  await sql.unsafe(
    `ALTER TABLE early_access_submissions ADD COLUMN IF NOT EXISTS reward_issued_at TIMESTAMPTZ;`,
  );

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS referrals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_user_id UUID NOT NULL REFERENCES users(id),
      referred_user_id UUID NOT NULL REFERENCES users(id),
      referral_code VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      reward_credits_issued INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      completed_at TIMESTAMPTZ,
      CONSTRAINT uq_referrals_referred_user UNIQUE (referred_user_id),
      CONSTRAINT uq_referrals_pair UNIQUE (referrer_user_id, referred_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
    CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason VARCHAR(30) NOT NULL,
      description TEXT,
      reference_type VARCHAR(30),
      reference_id UUID,
      idempotency_key VARCHAR(100) UNIQUE,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_credit_ledger_idempotency ON credit_ledger(idempotency_key);
  `);
  console.log("[0025] Done.\n");

  console.log("Migration repair complete! All missing DDL has been applied.");
}

repair()
  .catch((err) => {
    console.error("Repair failed:", err);
    process.exit(1);
  })
  .finally(() => sql.end());
