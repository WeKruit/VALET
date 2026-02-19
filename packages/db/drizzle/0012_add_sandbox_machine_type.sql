-- Add machine type and agent/deploy tracking columns to sandboxes
ALTER TABLE sandboxes
  ADD COLUMN machine_type VARCHAR(20) NOT NULL DEFAULT 'ec2',
  ADD COLUMN agent_version VARCHAR(50),
  ADD COLUMN agent_last_seen_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN gh_image_tag VARCHAR(255),
  ADD COLUMN gh_image_updated_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN deployed_commit_sha VARCHAR(40);
