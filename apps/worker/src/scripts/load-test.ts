/**
 * Load test for sandbox performance
 * Tests concurrent browser session simulation on a single sandbox.
 *
 * Scenarios:
 *   - Concurrent HTTP health checks against the sandbox worker
 *   - Concurrent AdsPower profile create/start/stop/delete cycles
 *   - Memory and CPU sampling during test execution
 *
 * Usage:
 *   pnpm --filter @valet/worker exec tsx src/scripts/load-test.ts
 *   pnpm --filter @valet/worker exec tsx src/scripts/load-test.ts --concurrency 10
 *   pnpm --filter @valet/worker exec tsx src/scripts/load-test.ts --scenario health-only
 *
 * Environment variables:
 *   SANDBOX_IP       - Public IP of the sandbox to test (default: 34.197.248.80)
 *   ADSPOWER_API_URL - AdsPower API URL (default: http://${SANDBOX_IP}:50325)
 *   CONCURRENCY      - Number of concurrent sessions (default: 20)
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";

// Load .env from monorepo root
const envPath = resolve(import.meta.dirname, "../../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1]! : fallback;
}

const SANDBOX_IP = process.env.SANDBOX_IP ?? "34.197.248.80";
const ADSPOWER_API_URL =
  process.env.ADSPOWER_API_URL ?? `http://${SANDBOX_IP}:50325`;
const CONCURRENCY = parseInt(
  getArg("concurrency", process.env.CONCURRENCY ?? "20"),
  10,
);
const SCENARIO = getArg("scenario", "all") as
  | "all"
  | "health-only"
  | "browser-only"
  | "api-stress";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskResult {
  taskId: number;
  scenario: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

interface PerformanceReport {
  testStartedAt: string;
  testCompletedAt: string;
  scenario: string;
  concurrency: number;
  sandboxIp: string;
  adspowerApiUrl: string;
  totalExecutionMs: number;
  results: {
    total: number;
    succeeded: number;
    failed: number;
    averageDurationMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    minMs: number;
    maxMs: number;
  };
  systemMetrics: {
    peakCpuPercent: number;
    peakMemoryMb: number;
    averageCpuPercent: number;
    averageMemoryMb: number;
    samples: SystemSample[];
  };
  errors: Array<{ taskId: number; error: string }>;
}

interface SystemSample {
  timestampMs: number;
  cpuPercent: number;
  memoryMb: number;
  heapUsedMb: number;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function log(msg: string, data?: unknown) {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${ts}] ${msg}`, JSON.stringify(data));
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

function getCpuUsage(): number {
  const cpus = os.cpus();
  return (
    cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length
  );
}

function getMemoryMb(): number {
  return Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);
}

// ---------------------------------------------------------------------------
// System metrics sampler
// ---------------------------------------------------------------------------

class MetricsSampler {
  private samples: SystemSample[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;

  start(intervalMs = 1000) {
    this.startTime = Date.now();
    this.samples = [];
    this.sample(); // immediate sample
    this.intervalId = setInterval(() => this.sample(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.sample(); // final sample
  }

  private sample() {
    const mem = process.memoryUsage();
    this.samples.push({
      timestampMs: Date.now() - this.startTime,
      cpuPercent: Math.round(getCpuUsage() * 100) / 100,
      memoryMb: getMemoryMb(),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    });
  }

  getResults() {
    const cpuValues = this.samples.map((s) => s.cpuPercent);
    const memValues = this.samples.map((s) => s.memoryMb);

    return {
      peakCpuPercent: Math.max(...cpuValues, 0),
      peakMemoryMb: Math.max(...memValues, 0),
      averageCpuPercent:
        cpuValues.length > 0
          ? Math.round(
              (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length) * 100,
            ) / 100
          : 0,
      averageMemoryMb:
        memValues.length > 0
          ? Math.round(
              memValues.reduce((a, b) => a + b, 0) / memValues.length,
            )
          : 0,
      samples: this.samples,
    };
  }
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

async function healthCheckTask(taskId: number): Promise<TaskResult> {
  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`http://${SANDBOX_IP}:8000/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    await response.json();

    return {
      taskId,
      scenario: "health-check",
      durationMs: Math.round(performance.now() - start),
      success: true,
    };
  } catch (err) {
    return {
      taskId,
      scenario: "health-check",
      durationMs: Math.round(performance.now() - start),
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function browserLifecycleTask(taskId: number): Promise<TaskResult> {
  const start = performance.now();
  const profileName = `load-test-${taskId}-${Date.now()}`;
  let profileId: string | null = null;

  try {
    // Create profile
    const createResp = await fetch(`${ADSPOWER_API_URL}/api/v1/user/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: "0",
        name: profileName,
        user_proxy_config: { proxy_soft: "no_proxy" },
        fingerprint_config: {
          automatic_timezone: "1",
          language: ["en-US"],
          webrtc: "disabled",
        },
      }),
    });

    const createJson = (await createResp.json()) as {
      code: number;
      msg: string;
      data: { id: string };
    };

    if (createJson.code !== 0) {
      throw new Error(`Create profile failed: ${createJson.msg}`);
    }
    profileId = createJson.data.id;

    // Start browser
    const startParams = new URLSearchParams({
      user_id: profileId,
      open_tabs: "1",
      ip_tab: "0",
      headless: "0",
      cdp_mask: "1",
    });

    const startResp = await fetch(
      `${ADSPOWER_API_URL}/api/v1/browser/start?${startParams.toString()}`,
    );
    const startJson = (await startResp.json()) as {
      code: number;
      msg: string;
    };

    if (startJson.code !== 0) {
      throw new Error(`Start browser failed: ${startJson.msg}`);
    }

    // Let browser settle briefly
    await sleep(500);

    // Stop browser
    const stopParams = new URLSearchParams({ user_id: profileId });
    await fetch(
      `${ADSPOWER_API_URL}/api/v1/browser/stop?${stopParams.toString()}`,
    );

    await sleep(300);

    // Delete profile
    await fetch(`${ADSPOWER_API_URL}/api/v1/user/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: [profileId] }),
    });

    return {
      taskId,
      scenario: "browser-lifecycle",
      durationMs: Math.round(performance.now() - start),
      success: true,
    };
  } catch (err) {
    // Attempt cleanup on failure
    if (profileId) {
      try {
        const stopParams = new URLSearchParams({ user_id: profileId });
        await fetch(
          `${ADSPOWER_API_URL}/api/v1/browser/stop?${stopParams.toString()}`,
        ).catch(() => {});
        await sleep(200);
        await fetch(`${ADSPOWER_API_URL}/api/v1/user/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_ids: [profileId] }),
        }).catch(() => {});
      } catch {
        // ignore cleanup errors
      }
    }

    return {
      taskId,
      scenario: "browser-lifecycle",
      durationMs: Math.round(performance.now() - start),
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function apiStressTask(taskId: number): Promise<TaskResult> {
  const start = performance.now();
  try {
    // Rapid-fire multiple health check requests to stress the endpoint
    const requests = Array.from({ length: 5 }, () =>
      fetch(`http://${SANDBOX_IP}:8000/health`, {
        signal: AbortSignal.timeout(5000),
      }).then((r) => r.json()),
    );

    await Promise.all(requests);

    return {
      taskId,
      scenario: "api-stress",
      durationMs: Math.round(performance.now() - start),
      success: true,
    };
  } catch (err) {
    return {
      taskId,
      scenario: "api-stress",
      durationMs: Math.round(performance.now() - start),
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

function buildReport(
  startedAt: string,
  completedAt: string,
  totalMs: number,
  results: TaskResult[],
  metrics: MetricsSampler,
): PerformanceReport {
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);

  return {
    testStartedAt: startedAt,
    testCompletedAt: completedAt,
    scenario: SCENARIO,
    concurrency: CONCURRENCY,
    sandboxIp: SANDBOX_IP,
    adspowerApiUrl: ADSPOWER_API_URL,
    totalExecutionMs: totalMs,
    results: {
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      averageDurationMs:
        durations.length > 0
          ? Math.round(
              durations.reduce((a, b) => a + b, 0) / durations.length,
            )
          : 0,
      p50Ms: percentile(durations, 50),
      p95Ms: percentile(durations, 95),
      p99Ms: percentile(durations, 99),
      minMs: durations[0] ?? 0,
      maxMs: durations[durations.length - 1] ?? 0,
    },
    systemMetrics: metrics.getResults(),
    errors: failed.map((r) => ({
      taskId: r.taskId,
      error: r.error ?? "Unknown error",
    })),
  };
}

async function runScenario(
  name: string,
  taskFn: (taskId: number) => Promise<TaskResult>,
  concurrency: number,
): Promise<TaskResult[]> {
  log(`--- Running scenario: ${name} (concurrency: ${concurrency}) ---`);

  const tasks = Array.from({ length: concurrency }, (_, i) => taskFn(i));
  const results = await Promise.all(tasks);

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  log(`Scenario ${name} complete`, { succeeded, failed });

  return results;
}

async function main() {
  log("=== Valet Load Test ===");
  log("Configuration", {
    sandboxIp: SANDBOX_IP,
    adspowerApiUrl: ADSPOWER_API_URL,
    concurrency: CONCURRENCY,
    scenario: SCENARIO,
  });

  const sampler = new MetricsSampler();
  sampler.start(1000);

  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  let allResults: TaskResult[] = [];

  try {
    // Scenario 1: Health check stress
    if (SCENARIO === "all" || SCENARIO === "health-only") {
      const healthResults = await runScenario(
        "health-check",
        healthCheckTask,
        CONCURRENCY,
      );
      allResults = allResults.concat(healthResults);

      // Brief pause between scenarios
      if (SCENARIO === "all") await sleep(2000);
    }

    // Scenario 2: Browser lifecycle
    if (SCENARIO === "all" || SCENARIO === "browser-only") {
      const browserResults = await runScenario(
        "browser-lifecycle",
        browserLifecycleTask,
        CONCURRENCY,
      );
      allResults = allResults.concat(browserResults);

      if (SCENARIO === "all") await sleep(2000);
    }

    // Scenario 3: API stress
    if (SCENARIO === "all" || SCENARIO === "api-stress") {
      const apiResults = await runScenario(
        "api-stress",
        apiStressTask,
        CONCURRENCY,
      );
      allResults = allResults.concat(apiResults);
    }
  } finally {
    sampler.stop();
  }

  const totalMs = Math.round(performance.now() - startMs);
  const completedAt = new Date().toISOString();

  const report = buildReport(startedAt, completedAt, totalMs, allResults, sampler);

  // Print summary
  log("=== RESULTS ===");
  log(`Total execution time: ${report.totalExecutionMs}ms`);
  log(`Tasks: ${report.results.total} total, ${report.results.succeeded} passed, ${report.results.failed} failed`);
  log(`Latency: avg=${report.results.averageDurationMs}ms, p50=${report.results.p50Ms}ms, p95=${report.results.p95Ms}ms, p99=${report.results.p99Ms}ms`);
  log(`System: peak CPU=${report.systemMetrics.peakCpuPercent}%, peak Memory=${report.systemMetrics.peakMemoryMb}MB`);

  if (report.errors.length > 0) {
    log("Errors:");
    for (const err of report.errors.slice(0, 10)) {
      log(`  Task ${err.taskId}: ${err.error}`);
    }
    if (report.errors.length > 10) {
      log(`  ... and ${report.errors.length - 10} more`);
    }
  }

  // Write report to file
  const reportPath = resolve(
    import.meta.dirname,
    "../../../../core-docs/testing/load-test-results.json",
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  log(`Report written to ${reportPath}`);

  // Also write a condensed summary
  const summaryReport = {
    ...report,
    systemMetrics: {
      ...report.systemMetrics,
      samples: `[${report.systemMetrics.samples.length} samples omitted]`,
    },
  };
  console.log("\n--- JSON Report (condensed) ---");
  console.log(JSON.stringify(summaryReport, null, 2));

  if (report.results.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exitCode = 1;
});
