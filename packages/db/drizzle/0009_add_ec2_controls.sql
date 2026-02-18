-- Add EC2 instance control columns to sandboxes table

DO $$ BEGIN
  CREATE TYPE "ec2_status" AS ENUM ('pending', 'running', 'stopping', 'stopped', 'terminated');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "sandboxes"
  ADD COLUMN IF NOT EXISTS "ec2_status" "ec2_status" DEFAULT 'stopped',
  ADD COLUMN IF NOT EXISTS "last_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_stopped_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "auto_stop_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "idle_minutes_before_stop" integer DEFAULT 30 NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_sandboxes_ec2_status" ON "sandboxes" ("ec2_status");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_auto_stop" ON "sandboxes" ("auto_stop_enabled") WHERE "auto_stop_enabled" = true;

COMMENT ON COLUMN "sandboxes"."ec2_status" IS 'Current EC2 instance state (synced from AWS)';
COMMENT ON COLUMN "sandboxes"."last_started_at" IS 'When the EC2 instance was last started';
COMMENT ON COLUMN "sandboxes"."last_stopped_at" IS 'When the EC2 instance was last stopped';
COMMENT ON COLUMN "sandboxes"."auto_stop_enabled" IS 'Whether to auto-stop the instance when idle';
COMMENT ON COLUMN "sandboxes"."idle_minutes_before_stop" IS 'Minutes of zero load before auto-stop triggers';
