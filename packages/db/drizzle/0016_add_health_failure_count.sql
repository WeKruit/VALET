-- Add health_check_failure_count to sandboxes table
-- Tracks consecutive health check failures, persisted across deploys
ALTER TABLE "sandboxes" ADD COLUMN "health_check_failure_count" integer DEFAULT 0 NOT NULL;
