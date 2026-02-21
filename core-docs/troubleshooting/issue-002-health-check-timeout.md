# Issue 002: Health Check Timeout Spam

**Status**: Fixed
**Date**: 2026-02-14
**Severity**: Medium

## Symptoms

API server logs filled with health check timeout errors every 5 minutes:

```
WARN: Health check failed for sandbox { sandboxId: "...", err: "AbortError: The operation was aborted" }
ERROR: Sandbox is unhealthy { sandboxId: "...", details: { error: "The operation was aborted" } }
```

## Root Cause

The health monitor runs every 5 minutes and checks all sandboxes with `status = 'active'`.
It attempts to reach `http://<publicIp>:8000/health` on each sandbox.

The problem: The sandbox's `ec2_status` was `'stopped'` (the EC2 instance was not running),
but the health monitor didn't check this field before attempting the HTTP request. A stopped
EC2 instance cannot respond to HTTP requests, so every check timed out after 3 seconds.

Additionally:
- The 3-second timeout was too aggressive for cross-region health checks
- Unhealthy sandboxes were logged at ERROR level, creating excessive noise
- The health check URL was not included in error logs, making debugging harder

## Fixes Applied

### `apps/api/src/modules/sandboxes/sandbox.service.ts`

1. **Skip stopped instances**: `healthCheck()` returns early for sandboxes where
   `ec2Status` is `stopped`, `terminated`, or `stopping`, preserving their current
   health status without making an HTTP request.

2. **Skip in bulk check**: `checkAllSandboxes()` skips sandboxes where `ec2Status`
   is not `running` or `pending`, with debug-level logging for skipped checks.

3. **Increased timeout**: Changed `HEALTH_CHECK_TIMEOUT_MS` from 3000 to 10000.

4. **Better error logging**: Health check URL included in warn log message.

### `apps/api/src/modules/sandboxes/sandbox-health-monitor.ts`

1. **Reduced log noise**: Changed "Running scheduled sandbox health checks" from
   info to debug level.

2. **Skip empty results**: When no running sandboxes exist, logs at debug level
   instead of producing a misleading "0 total" summary.

3. **Downgraded unhealthy log**: Individual unhealthy sandbox logs changed from
   error to warn level.

### `apps/api/src/modules/sandboxes/__tests__/integration.test.ts`

1. Updated test fixture `ec2Status` from `null` to `"running"` to match new
   behavior where non-running instances are skipped.

## Verification

1. All 22 unit tests pass
2. API endpoint returns correct data
3. Health monitor will skip stopped instances (verified via code review)

## Prevention

- When adding new sandbox state fields (like `ec2_status`), update all consumers
  that make assumptions about sandbox reachability
- Consider adding a `isReachable()` helper that checks both `publicIp` and `ec2Status`
- Future: Add consecutive failure threshold before marking as unhealthy
