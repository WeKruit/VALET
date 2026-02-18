-- Add HITL interaction columns to tasks table

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "interaction_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "interaction_data" jsonb;

CREATE INDEX IF NOT EXISTS "idx_tasks_interaction_type" ON "tasks" ("interaction_type") WHERE "interaction_type" IS NOT NULL;
