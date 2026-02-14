-- Add browser engine configuration to sandboxes table

DO $$ BEGIN
  CREATE TYPE "browser_engine" AS ENUM ('chromium', 'adspower');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "sandboxes" ADD COLUMN IF NOT EXISTS "browser_engine" "browser_engine" DEFAULT 'adspower' NOT NULL;
ALTER TABLE "sandboxes" ADD COLUMN IF NOT EXISTS "browser_config" jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN "sandboxes"."browser_engine" IS 'Browser engine used by this sandbox (chromium or adspower)';
COMMENT ON COLUMN "sandboxes"."browser_config" IS 'Engine-specific configuration (JSON)';
