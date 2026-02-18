-- Add sandbox_id column to tasks table for proper sandbox-task association.
-- Replaces the brittle ILIKE pattern matching on the notes field.

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "sandbox_id" uuid;

-- Backfill sandbox_id from existing notes tags: [sandbox:<uuid>]
UPDATE "tasks"
SET "sandbox_id" = (
  regexp_match("notes", '\[sandbox:([0-9a-f-]{36})\]')
)[1]::uuid
WHERE "notes" LIKE '%[sandbox:%'
  AND "sandbox_id" IS NULL;

-- Index for fast sandbox-task lookups (used by worker status page)
CREATE INDEX IF NOT EXISTS "idx_tasks_sandbox_id" ON "tasks" ("sandbox_id") WHERE "sandbox_id" IS NOT NULL;

-- Composite index for the common query: active tasks for a sandbox
CREATE INDEX IF NOT EXISTS "idx_tasks_sandbox_status" ON "tasks" ("sandbox_id", "status") WHERE "sandbox_id" IS NOT NULL;
