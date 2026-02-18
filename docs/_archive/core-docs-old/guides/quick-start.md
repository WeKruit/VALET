# Quick Start Guide

Get up and running with Valet sandbox management in 5 minutes.

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL (or Supabase account)
- AWS account (optional, for EC2 start/stop)

## Setup

1. **Clone and install**:

   ```bash
   git clone https://github.com/WeKruit/VALET.git
   cd VALET
   cp .env.example .env
   pnpm install
   ```

2. **Configure .env** (minimum required):

   ```bash
   # Database
   DATABASE_URL=postgresql://...
   DATABASE_DIRECT_URL=postgresql://...

   # Auth
   JWT_SECRET=$(openssl rand -base64 48)
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...

   # AWS (optional, for EC2 start/stop)
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-1
   ```

3. **Run migrations**:

   ```bash
   pnpm db:migrate
   ```

4. **Start dev servers**:

   ```bash
   pnpm dev
   ```

5. **Open the app**:
   - Web: http://localhost:5173
   - API: http://localhost:8000
   - Login with Google OAuth
   - Navigate to Admin > Sandboxes

## Register Your First Sandbox

### Via API

```bash
curl -X POST http://localhost:8000/api/v1/admin/sandboxes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dev-sandbox-1",
    "environment": "dev",
    "instanceId": "i-0123456789abcdef0",
    "instanceType": "t3.medium",
    "publicIp": "34.197.248.80",
    "capacity": 5,
    "browserEngine": "adspower"
  }'
```

### Via GitHub Actions

1. Go to Actions > Provision Sandbox > Run workflow
2. Select environment, instance type, browser engine, capacity
3. The workflow handles everything (Terraform, deploy, API registration)

## Manage Sandboxes

### Start/Stop EC2 (cost savings)

```bash
# Start
curl -X POST http://localhost:8000/api/v1/admin/sandboxes/$ID/start \
  -H "Authorization: Bearer $TOKEN"

# Stop
curl -X POST http://localhost:8000/api/v1/admin/sandboxes/$ID/stop \
  -H "Authorization: Bearer $TOKEN"

# Check status
curl http://localhost:8000/api/v1/admin/sandboxes/$ID/ec2-status \
  -H "Authorization: Bearer $TOKEN"
```

Or use the UI: click a sandbox > EC2 Controls > Start/Stop buttons.

### Configure Auto-Stop

```bash
curl -X PATCH http://localhost:8000/api/v1/admin/sandboxes/$ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"autoStopEnabled": true, "idleMinutesBeforeStop": 30}'
```

### Deploy Worker to Sandbox

```bash
./infra/scripts/deploy-worker.sh \
  --host 34.197.248.80 \
  --key ~/.ssh/valet-worker.pem
```

### Check Sandbox Health

```bash
./infra/scripts/health-check.sh 34.197.248.80
```

## SSH Access

All sandboxes use a single shared SSH key:

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80
```

## Common Issues

**Issue**: AWS credentials not configured
**Fix**: Add `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to `.env`. EC2 start/stop requires valid AWS credentials.

**Issue**: SSH connection refused
**Fix**: Check if the EC2 instance is stopped. Start it via the API or UI first.

**Issue**: Start/stop buttons don't respond
**Fix**: Verify AWS credentials are set. Check browser DevTools network tab for error responses.

**Issue**: Health check shows "unhealthy"
**Fix**: SSH to the instance and check `sudo journalctl -u valet-worker -n 50 --no-pager`. The worker service may need secrets configured via `set-secrets.sh`.

**Issue**: Deployment fails with "frozen-lockfile" error
**Fix**: The script retries without `--frozen-lockfile`. If it still fails, SSH to the instance and run `pnpm install --prod` manually in `/opt/valet/app`.
