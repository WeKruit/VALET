-- Add 'developer' to user_role enum
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'developer';

-- Create early_access_submissions table for waitlist signups
CREATE TABLE IF NOT EXISTS "early_access_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "source" varchar(50) NOT NULL DEFAULT 'landing_page',
  "referral_code" varchar(100),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique index on email for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS "early_access_email_idx"
  ON "early_access_submissions" ("email");
