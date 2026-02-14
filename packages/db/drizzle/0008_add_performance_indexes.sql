-- Performance optimization: add composite and sort indexes for sandbox queries

-- Composite index for filtering by status + health_status together
-- Used by fleet monitoring dashboards and health-check sweeps
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sandboxes_status_health"
  ON "sandboxes" ("status", "health_status");

-- Index on updated_at for ORDER BY sorting (list endpoint default sort)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sandboxes_updated_at"
  ON "sandboxes" ("updated_at" DESC);
