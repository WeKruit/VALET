-- Migration 0015: Enable Supabase Realtime on gh_job_events and gh_automation_jobs
-- Required for VALET frontend to subscribe to live job status + event streams
--
-- GH migration 012 may have already added gh_job_events to the publication.
-- This migration is idempotent — safe to run regardless.

-- ============================================================================
-- 1. Add tables to supabase_realtime publication (idempotent)
-- ============================================================================

DO $$
BEGIN
  -- Add gh_job_events if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'gh_job_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gh_job_events;
  END IF;

  -- Add gh_automation_jobs if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'gh_automation_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gh_automation_jobs;
  END IF;
END $$;

-- ============================================================================
-- 2. Enable RLS (idempotent — no-op if already enabled)
-- ============================================================================

ALTER TABLE gh_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gh_automation_jobs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RLS policies — gh_automation_jobs
-- ============================================================================

-- Service role: full access (used by API server and worker processes)
CREATE POLICY "Service role full access on gh_automation_jobs"
    ON gh_automation_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users: SELECT own jobs via metadata->>'valet_user_id'
CREATE POLICY "Users can read own automation jobs"
    ON gh_automation_jobs
    FOR SELECT
    TO authenticated
    USING (metadata->>'valet_user_id' = auth.uid()::text);

-- ============================================================================
-- 4. RLS policies — gh_job_events
-- ============================================================================

-- Service role: full access
CREATE POLICY "Service role full access on gh_job_events"
    ON gh_job_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users: SELECT events for their own jobs
CREATE POLICY "Users can read own job events"
    ON gh_job_events
    FOR SELECT
    TO authenticated
    USING (
      job_id IN (
        SELECT id FROM gh_automation_jobs
        WHERE metadata->>'valet_user_id' = auth.uid()::text
      )
    );
