/**
 * End-to-end test script for AdsPower + Stagehand browser automation.
 *
 * Verifies the full pipeline:
 *   1. Connect to AdsPower API
 *   2. Create a browser profile
 *   3. Start the browser and get a CDP URL
 *   4. Connect Stagehand to the CDP URL
 *   5. Navigate to a test site and extract data
 *   6. Clean up (stop browser, delete profile)
 *
 * Usage:
 *   pnpm --filter @valet/worker exec tsx src/scripts/test-adspower.ts
 *
 * Environment variables:
 *   ADSPOWER_API_URL  - AdsPower API base URL (default: http://127.0.0.1:50325)
 *   ANTHROPIC_API_KEY - Required for Stagehand LLM calls
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";

// Load .env from monorepo root (same pattern as main.ts)
const envPath = resolve(import.meta.dirname, "../../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

import { AdsPowerClient } from "../clients/adspower.js";
import { StagehandEngine } from "../engines/stagehand-engine.js";

const ADSPOWER_API_URL =
  process.env.ADSPOWER_API_URL ?? "http://127.0.0.1:50325";
const TEST_PROFILE_NAME = "valet-test-e2e";

function log(step: string, detail?: unknown) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${step}`, detail ?? "");
}

async function main() {
  const client = new AdsPowerClient({ baseUrl: ADSPOWER_API_URL });
  const engine = new StagehandEngine({ verbose: 1 });

  let profileId: string | null = null;

  try {
    // Step 1: Health check
    log("Health check", { url: ADSPOWER_API_URL });
    const health = await client.healthCheck();
    if (!health.healthy) {
      throw new Error(`AdsPower is not healthy: ${health.message}`);
    }
    log("Health check passed");

    // Step 2: Create test profile
    log("Creating test profile", { name: TEST_PROFILE_NAME });
    const profile = await client.createProfile({ name: TEST_PROFILE_NAME });
    profileId = profile.profileId;
    log("Profile created", { profileId });

    // Step 3: Start browser and get CDP URL
    log("Starting browser");
    const session = await client.startBrowser(profileId);
    log("Browser started", { cdpUrl: session.cdpUrl, port: session.port });

    // Give the browser a moment to settle
    await sleep(2000);

    // Step 4: Connect Stagehand to CDP
    log("Connecting Stagehand to CDP");
    await engine.connect(session.cdpUrl);
    log("Stagehand connected");

    // Step 5: Navigate to test site
    log("Navigating to https://example.com");
    await engine.navigate("https://example.com");
    log("Navigation complete");

    // Step 6: Extract the page title
    log("Extracting page title via Stagehand");
    const result = await engine.extract(
      "Extract the main heading text from this page",
      { title: "string" },
    );
    log("Extraction result", result.data);

    // Step 7: Get page state for additional verification
    const pageState = await engine.getPageState();
    log("Page state", {
      url: pageState.url,
      title: pageState.title,
    });

    // Step 8: Take a screenshot
    log("Taking screenshot");
    const screenshotBuffer = await engine.screenshot();
    log("Screenshot captured", { bytes: screenshotBuffer.length });

    log("E2E test PASSED");
  } catch (err) {
    log("E2E test FAILED", err);
    process.exitCode = 1;
  } finally {
    // Cleanup: disconnect Stagehand
    if (engine.isConnected()) {
      log("Disconnecting Stagehand");
      try {
        await engine.disconnect();
      } catch (err) {
        log("Warning: Stagehand disconnect error", err);
      }
    }

    // Cleanup: stop browser and delete profile
    if (profileId) {
      log("Stopping browser", { profileId });
      try {
        await client.stopBrowser(profileId);
      } catch (err) {
        log("Warning: browser stop error", err);
      }

      await sleep(1000);

      log("Deleting test profile", { profileId });
      try {
        await client.deleteProfiles([profileId]);
      } catch (err) {
        log("Warning: profile delete error", err);
      }
    }

    log("Cleanup complete");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main();
