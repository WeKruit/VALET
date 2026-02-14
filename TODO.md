# VALET - TODO List

## Immediate (Before Production)

- [ ] Add health endpoint to EC2 worker (port 8000) so health checks succeed
- [ ] Configure EC2 security group to allow port 8000 from API server
- [ ] Set `HEALTH_PORT=8000` in EC2 worker `.env`
- [ ] Verify admin user accounts have correct `role = 'admin'` in database
- [ ] Run database migrations on production: verify 0009_add_ec2_controls applied
- [ ] Test sandbox start/stop flow end-to-end with real AWS credentials
- [ ] Verify Hatchet worker connectivity from EC2 instance

## High Priority

- [ ] Add consecutive failure threshold for health checks (mark unhealthy only after N failures)
- [ ] Add WebSocket notifications for sandbox status changes (start/stop/health)
- [ ] Implement proper token refresh flow for admin pages
- [ ] Add `ec2Status` filter to repository `findMany` query - DONE
- [ ] Add error boundary component around admin pages for better error UX
- [ ] Separate Hatchet from application database (own Postgres schema or instance)

## Medium Priority

- [ ] Add sandbox creation wizard with EC2 instance provisioning
- [ ] Implement sandbox cost tracking (EC2 hours * instance type rate)
- [ ] Add audit log entries for sandbox start/stop/terminate actions
- [ ] Add bulk operations (start all, stop all) for sandbox fleet
- [ ] Implement sandbox SSH key rotation
- [ ] Add Terraform state management for multiple environments
- [ ] Create GitHub Actions workflow for EC2 worker deployments

## Low Priority

- [ ] Add sandbox metrics dashboard with charts (CPU, memory, disk over time)
- [ ] Implement sandbox auto-scaling based on task queue depth
- [ ] Add support for multiple browser engines per sandbox
- [ ] Create sandbox template system for quick provisioning
- [ ] Add sandbox backup/restore functionality
- [ ] Implement sandbox network isolation per tenant

## Security Checklist

- [ ] Rotate all Hatchet tokens (current ones expire 2031)
- [ ] Audit AWS IAM permissions — principle of least privilege
- [ ] Ensure EC2 security groups restrict SSH to known IPs only
- [ ] Add rate limiting to admin sandbox endpoints
- [ ] Implement RBAC for sandbox operations (not just admin/user)
- [ ] Add CSP headers for noVNC iframe embedding
- [ ] Audit and rotate Supabase service keys
- [ ] Enable AWS CloudTrail for EC2 API call logging
- [ ] Review and restrict CORS allowed origins in production
