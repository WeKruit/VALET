CREATE TABLE IF NOT EXISTS "user_sandboxes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sandbox_id" uuid NOT NULL REFERENCES "sandboxes"("id") ON DELETE CASCADE,
  "assigned_at" timestamptz DEFAULT now() NOT NULL,
  "assigned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "uq_user_sandboxes_user" UNIQUE ("user_id")
);

CREATE INDEX IF NOT EXISTS "idx_user_sandboxes_user_id" ON "user_sandboxes" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_sandboxes_sandbox_id" ON "user_sandboxes" ("sandbox_id");
