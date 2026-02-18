# Optimization Test Report

## Test Date

2026-02-14

## Test Summary

- **Total Tests**: 22 unit tests + manual verification checks
- **Passed**: 22/22 unit tests
- **Failed**: 0
- **Warnings**: 1 (pre-existing Zod version mismatch in web auth pages)

## Secrets Removal

| Check                                           | Status | Notes                                                                                 |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| System works without SANDBOX_SECRETS_KEY        | PASS   | No references in .env.example or runtime code                                         |
| No SandboxSecretsService in app code            | PASS   | File removed from `apps/api/src/modules/sandboxes/`                                   |
| No secrets API endpoints                        | PASS   | Routes removed from contract and router                                               |
| DI container clean                              | PASS   | No SandboxSecretsService registration                                                 |
| Documentation references only deprecation notes | PASS   | Only in `08-secrets-simplified.md`, `cicd-workflows.md`, `migration-to-shared-key.md` |
| sandbox-secret.schema.ts marked deprecated      | PASS   | `@deprecated` JSDoc added                                                             |
| sandbox_secrets DB table kept (data safety)     | PASS   | Not dropped; excluded from tablesFilter                                               |
| All 22 API tests pass                           | PASS   | `pnpm --filter @valet/api exec vitest run`                                            |

## EC2 Start/Stop

| Check                                                      | Status | Notes                                                            |
| ---------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| EC2Service created                                         | PASS   | `apps/api/src/modules/sandboxes/ec2.service.ts`                  |
| startInstance/stopInstance/getInstanceStatus implemented   | PASS   | Uses `@aws-sdk/client-ec2`                                       |
| SandboxService.startSandbox()                              | PASS   | Validates state, calls EC2, polls in background                  |
| SandboxService.stopSandbox()                               | PASS   | Validates state, calls EC2, polls in background                  |
| SandboxService.getEc2Status()                              | PASS   | Live AWS query, syncs DB                                         |
| API routes: POST /start, POST /stop, GET /ec2-status       | PASS   | All gated with adminOnly middleware                              |
| Contract updated with EC2 endpoints                        | PASS   | `packages/contracts/src/sandbox.ts`                              |
| DB schema has ec2_status, last_started_at, last_stopped_at | PASS   | `packages/db/src/schema/sandboxes.ts`                            |
| DB schema has auto_stop_enabled, idle_minutes_before_stop  | PASS   | Boolean + integer columns                                        |
| AutoStopMonitor created                                    | PASS   | `apps/api/src/modules/sandboxes/auto-stop-monitor.ts`            |
| DI container registers EC2Service + AutoStopMonitor        | PASS   | `apps/api/src/plugins/container.ts`                              |
| EC2 status polling with timeout                            | PASS   | `waitForStatus` method with configurable timeout                 |
| Conflict handling (409) for already running/stopped        | PASS   | AppError with appropriate codes                                  |
| No AWS credentials: clear error                            | N/A    | Requires live AWS to test; EC2Client will throw credential error |

## UI Testing

| Check                                          | Status | Notes                                           |
| ---------------------------------------------- | ------ | ----------------------------------------------- |
| Ec2StatusBadge component                       | PASS   | Color-coded badges with tooltips for all states |
| SandboxConnectionInfo component                | PASS   | SSH, noVNC, health URLs with copy-to-clipboard  |
| sandbox-detail-page uses connection info       | VERIFY | Component exists, imported in detail page       |
| ec2-status-badge shows transitional animations | PASS   | `animate-spin` on pending/stopping states       |
| Button variant fix (outline -> secondary)      | PASS   | Fixed in live-view.tsx                          |
| Copy-to-clipboard with feedback                | PASS   | Check/Copy icon toggle with 2s timeout          |

## Deployment

| Check                                           | Status | Notes                                                 |
| ----------------------------------------------- | ------ | ----------------------------------------------------- |
| cd-ec2.yml uses SANDBOX_SSH_KEY                 | PASS   | Single secret for all sandboxes                       |
| provision-sandbox.yml uses SANDBOX_SSH_KEY      | PASS   | No per-sandbox key lookup                             |
| terminate-sandbox.yml uses SANDBOX_SSH_KEY      | PASS   | Clean teardown                                        |
| deploy-worker.sh accepts --key parameter        | PASS   | `--key <path>` with default `~/.ssh/valet-worker.pem` |
| No references to per-sandbox key lookup         | PASS   | All workflows use single key pattern                  |
| cicd-workflows.md documents simplified approach | PASS   | `infra/docs/cicd-workflows.md`                        |
| migration-to-shared-key.md created              | PASS   | `infra/docs/migration-to-shared-key.md`               |

## TypeScript Health

| Package          | Status | Notes                                                                            |
| ---------------- | ------ | -------------------------------------------------------------------------------- |
| @valet/shared    | PASS   | Clean typecheck                                                                  |
| @valet/contracts | PASS   | Clean typecheck                                                                  |
| @valet/db        | PASS   | Clean typecheck                                                                  |
| @valet/llm       | PASS   | Clean typecheck                                                                  |
| @valet/ui        | PASS   | Clean typecheck                                                                  |
| @valet/api       | PASS   | Clean after test fixture fix                                                     |
| @valet/worker    | PASS   | Clean typecheck                                                                  |
| @valet/web       | WARN   | Pre-existing Zod v3 version mismatch in auth pages (not related to optimization) |

## Performance Expectations

| Metric           | Target                       | Notes                                                            |
| ---------------- | ---------------------------- | ---------------------------------------------------------------- |
| Page load        | < 2s                         | Sandbox list/detail pages use React Query with staleTime caching |
| API response P95 | < 200ms                      | CRUD operations are simple DB queries                            |
| Status polling   | Every 5s (transitional only) | Ec2StatusBadge polls only during pending/stopping                |
| Memory usage     | Stable                       | No polling when status is stable (running/stopped)               |

## Cost Savings Estimate

| Scenario          | Before    | After              | Savings       |
| ----------------- | --------- | ------------------ | ------------- |
| 5x t3.medium 24/7 | $173/mo   | $100/mo (12hr/day) | $73/mo (42%)  |
| 5x t3.large 24/7  | $347/mo   | $200/mo (12hr/day) | $147/mo (42%) |
| 20x t3.large 24/7 | $1,389/mo | $800/mo (12hr/day) | $589/mo (42%) |

Savings calculated using: stop overnight (12hr) + weekends = ~58% uptime reduction.
EBS storage cost (~$3.44/mo per instance) continues when stopped.

## Issues Found

1. **Test fixture missing EC2 fields**: `SandboxRecord` in integration tests didn't include `ec2Status`, `lastStartedAt`, `lastStoppedAt`, `autoStopEnabled`, `idleMinutesBeforeStop`. **Fixed**.
2. **Test mock missing ec2Service**: `SandboxService` constructor now requires `ec2Service` dependency. **Fixed**.
3. **Button variant mismatch**: `live-view.tsx` used `variant="outline"` which doesn't exist in the UI Button component. Changed to `variant="secondary"`. **Fixed**.
4. **Shared package not built**: `@valet/shared/errors` subpath export needed `pnpm --filter @valet/shared build` to generate dist. **Built**.
5. **Pre-existing Zod mismatch**: `@valet/web` auth pages have Zod v3 compatibility issues with hoisted `zod@3.25.76`. **Not fixed** (pre-existing, out of scope).

## Recommendations

1. Fix the Zod version mismatch in `@valet/web` auth pages (separate PR)
2. Add integration tests for EC2 start/stop with mocked AWS SDK
3. Add Slack/email alerts when sandboxes are auto-stopped
4. Consider adding a cost dashboard showing actual vs projected EC2 spend
5. Add Golden AMI for faster provisioning of new sandboxes
