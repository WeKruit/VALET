# Troubleshooting Guide

## Common Issues

### "Failed to load sandboxes" in Admin Dashboard

**Symptoms**: The admin sandboxes page shows "Failed to load sandboxes. Please try refreshing."

**Root Causes**:

1. **Authentication expired** - The user's JWT token has expired and refresh failed
2. **API server not running** - The API at localhost:8000 is down
3. **Network/CORS error** - Browser can't reach the API

**Debugging Steps**:

1. Open browser DevTools (F12) > Console tab. Look for errors.
2. Open Network tab, reload page. Find the `GET /api/v1/admin/sandboxes` request.
3. Check the response status code:
   - **401**: Token expired. Log out and log back in.
   - **403**: User doesn't have admin role. Check DB `users.role` column.
   - **500**: Server error. Check API server logs.
   - **Network Error / CORS**: API server is down or CORS misconfigured.

**Manual API Test**:

```bash
# Generate an admin token (replace JWT_SECRET with your actual secret)
TOKEN=$(pnpm --filter @valet/api exec tsx -e "
import { SignJWT } from 'jose';
async function main() {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: 'test', email: 'admin@valet.dev', role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer('valet-api')
    .sign(secret);
  console.log(token);
}
main();
")

# Test the endpoint
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/admin/sandboxes | python3 -m json.tool
```

**Fixes Applied**:

- Added `ec2Status` filter to repository query (was silently ignored)
- Added `ec2Status` to service list method type signature

---

### Health Check Timeout Spam

**Symptoms**: API logs filled with health check timeout errors every 5 minutes.

**Root Cause**: The health monitor attempts to reach stopped EC2 instances on port 8000, which always times out.

**Debugging Steps**:

1. Check sandbox `ec2_status` in database:
   ```sql
   SELECT id, name, ec2_status, health_status, public_ip FROM sandboxes;
   ```
2. If `ec2_status = 'stopped'`, health checks should be skipped (after fix)
3. If `ec2_status = 'running'` but health fails:
   - SSH to the EC2 instance and check if the worker is running
   - Verify port 8000 is open in the security group
   - Check `/opt/valet/.env` has `HEALTH_PORT=8000`

**Fixes Applied**:

- Health check skips stopped/terminated/stopping instances
- Timeout increased from 3s to 10s
- Error logging includes health check URL
- Unhealthy sandboxes logged at warn (not error) to reduce noise
- Monitor logs at debug level when no sandboxes need checking

---

### Start/Stop Sandbox Not Working

**Symptoms**: Clicking Start or Stop in the admin dashboard fails.

**Debugging Steps**:

1. Check browser console for the error response body
2. Common responses:
   - **409**: Instance already in target state (e.g., already running)
   - **502**: EC2 API call failed
3. Verify AWS credentials are configured:
   - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` must be set
   - IAM user needs `ec2:StartInstances`, `ec2:StopInstances`, `ec2:DescribeInstances`
4. Check the EC2 instance state in AWS Console
5. Verify the `instance_id` in the sandboxes table matches the actual EC2 instance

**Manual EC2 Status Check**:

```bash
aws ec2 describe-instance-status --instance-ids i-XXXXXXXXXXXX
```

---

### Database Migration Failures

**Symptoms**: Deploy fails during `release_command` (migration step).

**Debugging Steps**:

1. Check Fly.io release logs: `fly logs -a valet-api-stg`
2. Common issues:
   - Connection pool full: Wait and retry
   - Duplicate enum type: Migration uses `IF NOT EXISTS` guards
   - Hatchet table conflicts: Check `drizzle.config.ts` whitelist

---

## EC2 Worker Configuration

### Required Environment Variables

On the EC2 instance at `/opt/valet/.env`:

- `HEALTH_PORT=8000` - Health check endpoint port
- `HATCHET_CLIENT_TOKEN` - Worker authentication
- `DATABASE_URL` - For direct DB access if needed

### Required Security Group Rules

- Port 8000/TCP: Health checks from API server
- Port 6080/TCP: noVNC access
- Port 50325/TCP: AdsPower API (localhost only recommended)
- Port 22/TCP: SSH access

### Restarting the Worker

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@<IP>
sudo systemctl restart valet-worker
sudo journalctl -u valet-worker -f
```
