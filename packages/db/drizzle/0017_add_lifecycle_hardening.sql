-- WEK-185: Job lifecycle hardening
-- Adds status_version to tasks (optimistic locking for EC7)
-- Adds execution_attempt_id to gh_automation_jobs (dual execution prevention for EC3)

ALTER TABLE "tasks" ADD COLUMN "status_version" integer DEFAULT 0 NOT NULL;

ALTER TABLE "gh_automation_jobs" ADD COLUMN "execution_attempt_id" uuid;
