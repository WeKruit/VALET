-- platform_credentials: stores encrypted login credentials for job platforms
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

-- mailbox_credentials: stores encrypted email/mailbox access credentials
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

-- resume_variants: tailored resume versions per job application
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

-- job_leads: scraped/saved job opportunities
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

-- submission_proofs: evidence collected during application submission
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
