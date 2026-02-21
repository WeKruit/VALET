# Sandbox Management - Test Report

**Date:** 2026-02-14
**Author:** QA Specialist
**Environment:** Local development (macOS)

## Summary

| Metric          | Value |
|-----------------|-------|
| Test files      | 2     |
| Total tests     | 22    |
| Passed          | 22    |
| Failed          | 0     |
| Skipped         | 0     |
| Duration        | 342ms |

## API Integration Tests

**File:** `apps/api/src/modules/sandboxes/__tests__/integration.test.ts`

### Test Results

| Test Suite           | Tests | Pass | Fail | Status |
|----------------------|-------|------|------|--------|
| SandboxService       | 16    | 16   | 0    | PASS   |
| adminOnly middleware | 4     | 4    | 0    | PASS   |
| **Total**            | **22**| **22**| **0** | **PASS** |

### SandboxService Test Cases

| # | Test Case | Result |
|---|-----------|--------|
| 1 | getById - returns sandbox when found | PASS |
| 2 | getById - throws SandboxNotFoundError when not found | PASS |
| 3 | list - returns paginated results | PASS |
| 4 | list - calculates totalPages correctly | PASS |
| 5 | list - passes filters through to repository | PASS |
| 6 | create - creates sandbox when instanceId is unique | PASS |
| 7 | create - throws SandboxDuplicateInstanceError for duplicate instanceId | PASS |
| 8 | update - updates sandbox when found | PASS |
| 9 | update - throws SandboxNotFoundError when sandbox does not exist | PASS |
| 10 | update - throws SandboxNotFoundError when update returns null | PASS |
| 11 | terminate - terminates an existing sandbox | PASS |
| 12 | terminate - throws SandboxNotFoundError when sandbox does not exist | PASS |
| 13 | healthCheck - returns unhealthy when publicIp is null | PASS |
| 14 | healthCheck - throws SandboxNotFoundError when not found | PASS |
| 15 | healthCheck - handles fetch failure gracefully | PASS |
| 16 | healthCheck - returns healthy when worker responds ok | PASS |
| 17 | healthCheck - returns degraded when adspower is down | PASS |
| 18 | checkAllSandboxes - returns results for all active sandboxes | PASS |

### Admin Middleware Test Cases

| # | Test Case | Result |
|---|-----------|--------|
| 19 | allows admin role | PASS |
| 20 | allows superadmin role | PASS |
| 21 | rejects regular user role | PASS |
| 22 | rejects undefined role | PASS |

## E2E Tests (Pending)

**File:** `apps/web/tests/e2e/admin-sandboxes.spec.ts`

E2E tests are defined but require Playwright to be installed and configured. The test spec covers:

| Test Suite | Test Cases | Status |
|------------|-----------|--------|
| Admin Authentication | 3 | PENDING (needs Playwright) |
| Sandbox List Page | 4 | PENDING (needs Playwright) |
| Create Sandbox Flow | 1 | PENDING (needs Playwright) |
| Sandbox Detail Page | 2 | PENDING (needs Playwright) |
| Error Handling | 1 | PENDING (needs Playwright) |

### Setup Required

```bash
# Install Playwright
pnpm --filter @valet/web add -D @playwright/test
npx playwright install

# Seed test data
pnpm --filter @valet/db exec tsx src/seed-test-data.ts

# Run E2E tests
pnpm --filter @valet/web exec playwright test tests/e2e/admin-sandboxes.spec.ts
```

## Test Seed Data

**File:** `packages/db/src/seed-test-data.ts`

| Entity | Email/Name | Role/State |
|--------|-----------|------------|
| Admin user | admin@test.com | admin |
| Regular user | user@test.com | user |
| dev-sandbox-1 | i-test-dev-001 | active, healthy, chromium |
| staging-sandbox-1 | i-test-stg-001 | active, degraded, adspower |
| prod-sandbox-1 | i-test-prod-001 | active, unhealthy, adspower |

## Test Coverage

The integration tests cover:

- **Service layer:** All CRUD operations, pagination, filtering, error paths
- **Admin middleware:** Role-based access control (admin, superadmin, user, undefined)
- **Health checks:** Network errors, healthy/degraded/unhealthy states, missing IP
- **Fleet monitoring:** checkAllSandboxes aggregation

### Not Covered (Requires Running Database)

- Database query correctness (SQL generation, index usage)
- Transaction isolation and concurrent operations
- Full HTTP request/response cycle through Fastify
- WebSocket events for real-time updates
- File upload for SSH key secrets

## Critical Issues Found

No critical issues were found during testing. All service methods handle edge cases correctly:

1. SandboxNotFoundError is thrown consistently for missing sandboxes
2. SandboxDuplicateInstanceError prevents duplicate instance IDs
3. Health checks degrade gracefully on network failures
4. Admin middleware correctly blocks non-admin users

## Recommendations

1. **Add Playwright for E2E tests:** Install `@playwright/test` to enable the browser-based test suite
2. **Add test database:** Use a separate Postgres instance for integration tests to avoid affecting staging data
3. **CI integration:** Add test commands to the CI pipeline (`.github/workflows/ci.yml`)
4. **Coverage thresholds:** Set minimum coverage requirements once the test suite matures
