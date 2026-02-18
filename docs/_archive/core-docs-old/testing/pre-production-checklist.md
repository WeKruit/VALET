# Pre-Production Checklist

## Database

- [ ] Migration 0009_add_ec2_controls applied successfully on production
- [ ] All sandboxes have `ec2_status` populated (not NULL)
- [ ] `drizzle.config.ts` whitelist includes all VALET tables
- [ ] Transaction pooler (port 6543) configured as `DATABASE_URL`
- [ ] Session pooler (port 5432) configured as `DATABASE_DIRECT_URL`

## API Server

- [ ] Health endpoint responds: `GET /api/v1/health` returns 200
- [ ] Admin endpoints require authentication (401 without token)
- [ ] Admin endpoints require admin role (403 for regular users)
- [ ] Sandbox list endpoint returns correct data with EC2 fields
- [ ] Sandbox start/stop endpoints work with valid AWS credentials
- [ ] Health monitor skips stopped instances (no timeout spam in logs)
- [ ] Auto-stop monitor runs without errors
- [ ] Rate limiting is active on all endpoints
- [ ] CORS configured for production domain only

## Frontend

- [ ] Login flow works (Google OAuth redirect + token exchange)
- [ ] Admin dashboard loads sandbox list without errors
- [ ] EC2 status badges display correctly (running/stopped/pending/stopping)
- [ ] Start/stop buttons work and show optimistic UI updates
- [ ] Health check trigger works from dropdown menu
- [ ] Pagination works when sandbox count exceeds page size
- [ ] Filters work: environment, status, health status, EC2 status

## EC2 / Infrastructure

- [ ] EC2 instance is reachable from API server
- [ ] Security group allows port 8000 (health), 6080 (noVNC), 22 (SSH)
- [ ] Worker service (`valet-worker.service`) starts on boot
- [ ] AdsPower installed and API accessible on port 50325
- [ ] noVNC accessible at `http://<IP>:6080/vnc.html`
- [ ] AWS credentials set in API environment (for EC2 start/stop)
- [ ] IAM role has minimal required permissions

## Hatchet

- [ ] Worker connects to Hatchet gRPC endpoint
- [ ] Token is valid and not expired
- [ ] Dashboard accessible at Hatchet URL
- [ ] Workflows register successfully

## Monitoring

- [ ] API server logs accessible (Fly.io logs)
- [ ] Health monitor logs show expected check results
- [ ] No recurring error spam in logs
- [ ] Sentry configured and receiving errors

## Security

- [ ] JWT_SECRET is unique per environment
- [ ] All secrets set via `fly secrets` (not in code/config)
- [ ] `.env` file is gitignored
- [ ] CORS restricted to production origins
- [ ] Admin role required for all sandbox operations
- [ ] EC2 SSH keys stored securely
