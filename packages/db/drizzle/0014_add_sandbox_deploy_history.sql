-- Create sandbox deploy history table for tracking deployments
CREATE TABLE sandbox_deploy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id UUID REFERENCES sandboxes(id) ON DELETE SET NULL,
  image_tag VARCHAR(255) NOT NULL,
  commit_sha VARCHAR(40),
  commit_message TEXT,
  branch VARCHAR(255),
  environment VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deploy_started_at TIMESTAMP WITH TIME ZONE,
  deploy_completed_at TIMESTAMP WITH TIME ZONE,
  deploy_duration_ms INTEGER,
  rollback_of UUID REFERENCES sandbox_deploy_history(id),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deploy_history_sandbox_id ON sandbox_deploy_history(sandbox_id);
CREATE INDEX idx_deploy_history_env ON sandbox_deploy_history(environment);
CREATE INDEX idx_deploy_history_status ON sandbox_deploy_history(status);
CREATE INDEX idx_deploy_history_created_at ON sandbox_deploy_history(created_at);
