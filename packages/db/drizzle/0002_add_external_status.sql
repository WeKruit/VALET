-- Add external_status enum and column to tasks table
DO $$ BEGIN
  CREATE TYPE "public"."external_status" AS ENUM('applied', 'viewed', 'interview', 'rejected', 'offer', 'ghosted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "external_status" "external_status";--> statement-breakpoint
-- Add missing FK constraints from initial migration
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_browser_profile_id_browser_profiles_id_fk" FOREIGN KEY ("browser_profile_id") REFERENCES "public"."browser_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
