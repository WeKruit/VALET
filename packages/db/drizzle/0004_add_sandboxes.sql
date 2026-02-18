-- Custom SQL migration: add sandboxes table for EC2 fleet management

-- Create enum types
DO $$ BEGIN
  CREATE TYPE "sandbox_status" AS ENUM ('provisioning', 'active', 'stopping', 'stopped', 'terminated', 'unhealthy');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sandbox_health_status" AS ENUM ('healthy', 'degraded', 'unhealthy');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sandbox_environment" AS ENUM ('dev', 'staging', 'prod');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create sandboxes table
CREATE TABLE IF NOT EXISTS "sandboxes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "environment" "sandbox_environment" NOT NULL,
  "instance_id" varchar(50) NOT NULL UNIQUE,
  "instance_type" varchar(50) NOT NULL,
  "public_ip" varchar(45),
  "private_ip" varchar(45),
  "status" "sandbox_status" DEFAULT 'provisioning' NOT NULL,
  "health_status" "sandbox_health_status" DEFAULT 'unhealthy' NOT NULL,
  "last_health_check_at" timestamp with time zone,
  "capacity" integer DEFAULT 5 NOT NULL,
  "current_load" integer DEFAULT 0 NOT NULL,
  "ssh_key_name" varchar(255),
  "novnc_url" text,
  "adspower_version" varchar(50),
  "tags" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS "idx_sandboxes_environment" ON "sandboxes" ("environment");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_status" ON "sandboxes" ("status");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_health_status" ON "sandboxes" ("health_status");
CREATE INDEX IF NOT EXISTS "idx_sandboxes_env_status" ON "sandboxes" ("environment", "status");

-- Add table and column comments for documentation
COMMENT ON TABLE "sandboxes" IS 'EC2 sandbox instances for browser automation workers';
COMMENT ON COLUMN "sandboxes"."instance_id" IS 'AWS EC2 instance ID (i-xxxxxxxxx)';
COMMENT ON COLUMN "sandboxes"."instance_type" IS 'EC2 instance type (e.g. t3.medium)';
COMMENT ON COLUMN "sandboxes"."public_ip" IS 'Elastic IP address for external access';
COMMENT ON COLUMN "sandboxes"."private_ip" IS 'VPC private IP address';
COMMENT ON COLUMN "sandboxes"."capacity" IS 'Max concurrent browser profiles this sandbox can run';
COMMENT ON COLUMN "sandboxes"."current_load" IS 'Number of active browser profiles currently running';
COMMENT ON COLUMN "sandboxes"."ssh_key_name" IS 'Name of PEM key in secrets manager for SSH access';
COMMENT ON COLUMN "sandboxes"."novnc_url" IS 'noVNC URL for remote desktop monitoring';
COMMENT ON COLUMN "sandboxes"."adspower_version" IS 'Installed AdsPower version on this sandbox';
COMMENT ON COLUMN "sandboxes"."tags" IS 'Flexible metadata tags (JSON object)';
