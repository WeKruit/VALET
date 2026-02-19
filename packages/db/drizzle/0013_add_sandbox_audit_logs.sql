-- Create sandbox audit logs table for tracking admin actions
CREATE TABLE sandbox_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id UUID NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  result VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sandbox_audit_sandbox_id ON sandbox_audit_logs(sandbox_id);
CREATE INDEX idx_sandbox_audit_user_id ON sandbox_audit_logs(user_id);
CREATE INDEX idx_sandbox_audit_action ON sandbox_audit_logs(action);
CREATE INDEX idx_sandbox_audit_created_at ON sandbox_audit_logs(created_at);
