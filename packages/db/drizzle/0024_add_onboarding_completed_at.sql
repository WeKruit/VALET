-- Add onboarding_completed_at to users table
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" TIMESTAMP WITH TIME ZONE;
