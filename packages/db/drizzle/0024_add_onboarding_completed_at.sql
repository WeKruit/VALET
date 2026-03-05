-- Add onboarding_completed_at to users table
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" TIMESTAMP WITH TIME ZONE;

-- Clean up duplicate mailbox_credentials rows (keep newest per user+provider)
DELETE FROM "mailbox_credentials" a
  USING "mailbox_credentials" b
  WHERE a.user_id = b.user_id
    AND a.provider = b.provider
    AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id));

-- Add unique constraint to prevent future duplicates
ALTER TABLE "mailbox_credentials"
  ADD CONSTRAINT "uq_mailbox_credentials_user_provider"
  UNIQUE ("user_id", "provider");
