-- WEK-186: Add waitlist/beta roles and email templates

-- Add new user roles (waitlist, beta)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'waitlist';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'beta';

-- Add email tracking columns to early_access_submissions
ALTER TABLE early_access_submissions 
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS email_status VARCHAR(20) DEFAULT 'pending';

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  subject VARCHAR(255) NOT NULL,
  mjml_body TEXT NOT NULL,
  text_body TEXT,
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(name);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_early_access_email_status ON early_access_submissions(email_status);

-- Seed default email templates
INSERT INTO email_templates (name, description, subject, mjml_body, text_body, variables) VALUES
(
  'early_access_confirmation',
  'Sent when a user joins the waitlist',
  'You''re on the WeKruit Valet waitlist!',
  '<mjml><mj-head><mj-font name="Inter" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" /></mj-head><mj-body background-color="#f6f6f6"><mj-section padding="40px 20px"><mj-column background-color="#ffffff" border-radius="8px" padding="40px 40px"><mj-text font-family="Inter, -apple-system, sans-serif" font-size="24px" font-weight="600" color="#1a1a1a" padding-bottom="16px">You''re on the list, {{name}}!</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="15px" line-height="1.6" color="#4a4a4a" padding-bottom="16px">Thanks for signing up for early access to WeKruit Valet. You''re <strong>#{{position}}</strong> on the waitlist.</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="15px" line-height="1.6" color="#4a4a4a" padding-bottom="32px">We''re rolling out access in waves and will notify you as soon as it''s your turn.</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="13px" color="#999">— The WeKruit Team</mj-text></mj-column></mj-section></mj-body></mjml>',
  'You''re on the list, {{name}}!\n\nThanks for signing up for early access to WeKruit Valet. You''re #{{position}} on the waitlist.\n\nWe''re rolling out access in waves and will notify you as soon as it''s your turn.\n\n— The WeKruit Team',
  '[{"name":"name","required":true},{"name":"position","required":true}]'
),
(
  'beta_welcome',
  'Sent when a waitlist user is promoted to beta',
  'Welcome to WeKruit Valet Beta!',
  '<mjml><mj-head><mj-font name="Inter" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" /></mj-head><mj-body background-color="#f6f6f6"><mj-section padding="40px 20px"><mj-column background-color="#ffffff" border-radius="8px" padding="40px 40px"><mj-text font-family="Inter, -apple-system, sans-serif" font-size="24px" font-weight="600" color="#1a1a1a" padding-bottom="16px">Welcome to Beta, {{name}}!</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="15px" line-height="1.6" color="#4a4a4a" padding-bottom="16px">Great news — you''re in! Your early access to WeKruit Valet is now active.</mj-text><mj-button background-color="#1a1a1a" color="#ffffff" border-radius="8px" font-family="Inter, -apple-system, sans-serif" font-size="15px" font-weight="500" href="{{loginUrl}}">Get Started</mj-button><mj-text font-family="Inter, -apple-system, sans-serif" font-size="15px" line-height="1.6" color="#4a4a4a" padding-top="24px" padding-bottom="32px">As a beta user, you have early access to our AI-powered job application assistant.</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="13px" color="#999">— The WeKruit Team</mj-text></mj-column></mj-section></mj-body></mjml>',
  'Welcome to Beta, {{name}}!\n\nGreat news — you''re in! Your early access to WeKruit Valet is now active.\n\nGet started: {{loginUrl}}\n\n— The WeKruit Team',
  '[{"name":"name","required":true},{"name":"loginUrl","required":false}]'
),
(
  'welcome',
  'Sent when a user creates a full account',
  'Welcome to WeKruit Valet',
  '<mjml><mj-head><mj-font name="Inter" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" /></mj-head><mj-body background-color="#f6f6f6"><mj-section padding="40px 20px"><mj-column background-color="#ffffff" border-radius="8px" padding="40px 40px"><mj-text font-family="Inter, -apple-system, sans-serif" font-size="24px" font-weight="600" color="#1a1a1a" padding-bottom="16px">Welcome to Valet, {{name}}</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="15px" line-height="1.6" color="#4a4a4a" padding-bottom="32px">Your AI-powered job application assistant is ready.</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="13px" color="#999">— The WeKruit Team</mj-text></mj-column></mj-section></mj-body></mjml>',
  'Welcome to Valet, {{name}}\n\nYour AI-powered job application assistant is ready.\n\n— The WeKruit Team',
  '[{"name":"name","required":true}]'
),
(
  'task_completed',
  'Sent when a job application is successfully submitted',
  'Application submitted: {{jobTitle}} at {{companyName}}',
  '<mjml><mj-head><mj-font name="Inter" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" /></mj-head><mj-body background-color="#f6f6f6"><mj-section padding="40px 20px"><mj-column background-color="#ffffff" border-radius="8px" padding="40px 40px"><mj-text font-family="Inter, -apple-system, sans-serif" font-size="24px" font-weight="600" color="#1a1a1a" padding-bottom="16px">Application Submitted</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="15px" line-height="1.6" color="#4a4a4a" padding-bottom="32px">Hi {{name}}, your application for <strong>{{jobTitle}}</strong> at <strong>{{companyName}}</strong> has been submitted successfully.</mj-text><mj-text font-family="Inter, -apple-system, sans-serif" font-size="13px" color="#999">— The WeKruit Team</mj-text></mj-column></mj-section></mj-body></mjml>',
  'Application Submitted\n\nHi {{name}}, your application for {{jobTitle}} at {{companyName}} has been submitted successfully.\n\n— The WeKruit Team',
  '[{"name":"name","required":true},{"name":"jobTitle","required":true},{"name":"companyName","required":true}]'
)
ON CONFLICT (name) DO NOTHING;
