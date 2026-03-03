ALTER TABLE "sandboxes" ADD COLUMN "auto_stop_owner" varchar(16) NOT NULL DEFAULT 'none';
ALTER TABLE "sandboxes" ADD COLUMN "last_became_idle_at" timestamptz;
