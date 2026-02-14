# Issue 001: Sandbox List Loading Error

**Status**: Investigated and fixed
**Date**: 2026-02-14
**Severity**: Medium

## Symptoms

Admin dashboard at `/admin/sandboxes` shows "Failed to load sandboxes. Please try refreshing."

## Investigation

### API Testing

The API endpoint was tested directly with curl and returned valid data:

```
GET /api/v1/admin/sandboxes -> 200 OK
```

Response included all fields: id, name, environment, instanceId, instanceType, publicIp,
status, healthStatus, ec2Status, autoStopEnabled, idleMinutesBeforeStop, etc.

### Root Cause Analysis

1. **Primary cause**: The `ec2Status` query parameter was accepted by the ts-rest contract
   but not implemented in the repository's `findMany` method. While this didn't cause an
   error (the parameter was silently ignored), it meant EC2 status filtering didn't work.

2. **Contributing factor**: The service method's TypeScript type signature didn't include
   `ec2Status`, creating a type-level gap between the contract and implementation.

3. **Frontend error**: The "Failed to load sandboxes" message appears when `query.isError`
   is true in React Query, which occurs when the fetch function throws. This happens on:
   - Network errors (API unreachable)
   - Authentication failures (401 -> refresh fails -> redirect)
   - JSON parse errors

## Fixes Applied

### `apps/api/src/modules/sandboxes/sandbox.repository.ts`
- Added `ec2Status?: string` to `findMany` query parameter type
- Added EC2 status filter condition when `ec2Status` is provided

### `apps/api/src/modules/sandboxes/sandbox.service.ts`
- Added `ec2Status?: string` to `list` method query parameter type

## Verification

1. API endpoint tested with curl - returns correct data
2. EC2 status filter tested: `?ec2Status=stopped` correctly filters results
3. All 22 unit tests pass

## Prevention

- When adding new query parameters to ts-rest contracts, ensure the full chain is updated:
  contract -> routes -> service -> repository
- Consider adding integration tests that verify filter parameters end-to-end
