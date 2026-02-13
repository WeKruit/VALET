# 04 - Engine Switching & SandboxController

> **Scope**: Full implementation plan for `SandboxController` -- the worker-side orchestrator that manages AdsPower browser profiles, connects automation engines (Stagehand / Magnitude), and handles runtime switching between them when failures occur.

> **Status: Deferred to V2**
>
> Engine switching (Stagehand <-> Magnitude fallback cascade) is deferred until V2.
> The MVP uses a single automation engine (Selenium via AdsPower) with no engine switching.
> The SandboxController and switching protocol described here will be implemented after
> both Stagehand and Magnitude are integrated.
> See [`sandbox/03-ec2-worker-integration.md`](../sandbox/03-ec2-worker-integration.md) Section 16.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [CDP as Universal Protocol](#2-cdp-as-universal-protocol)
3. [SandboxController Full Implementation](#3-sandboxcontroller-full-implementation)
4. [Engine Switching Protocol](#4-engine-switching-protocol)
5. [Session State Preservation](#5-session-state-preservation)
6. [Concurrency Control](#6-concurrency-control)
7. [Fallback Cascade](#7-fallback-cascade)
8. [Engine Selection Logic](#8-engine-selection-logic)
9. [Cross-Task Engine Sharing](#9-cross-task-engine-sharing)
10. [Monitoring & Metrics](#10-monitoring--metrics)
11. [Testing Strategy](#11-testing-strategy)

---

## 1. Architecture Overview

The SandboxController sits between the Hatchet workflow tasks and the browser automation engines. It owns the browser lifecycle and guarantees that exactly one engine is connected at a time.

```
Hatchet Workflow (job-application)
  |
  v
SandboxController (per workflow run)
  |
  +-- AdsPower API (profile CRUD, start/stop browser)
  |     |
  |     v
  |   Chromium browser instance (one per profile)
  |     |
  |     +-- CDP WebSocket (ws://127.0.0.1:<port>/devtools/browser/<id>)
  |           |
  |           +-- [Active] Stagehand (DOM-first)
  |           |      OR
  |           +-- [Active] Magnitude (vision-first)
  |           |      OR
  |           +-- [Active] Human via VNC
  |
  +-- VNC layer (Xvfb -> x11vnc -> websockify -> noVNC)
```

Key invariant: **one active CDP client at a time**. The browser itself (managed by AdsPower) never restarts during a switch -- only the automation client disconnects and a new one connects to the same CDP WebSocket URL.

---

## 2. CDP as Universal Protocol

Chrome DevTools Protocol is the universal wire protocol that both Stagehand and Magnitude use to control the browser. AdsPower exposes a CDP WebSocket endpoint for each running profile.

### Connection Topology

```
                    AdsPower Local API
                    (http://127.0.0.1:50325)
                           |
                    POST /api/v1/browser/start
                           |
                           v
              +---------------------------+
              |  Chromium Browser Process  |
              |  (managed by AdsPower)     |
              |                           |
              |  CDP WebSocket Server     |
              |  ws://127.0.0.1:<port>    |
              |  /devtools/browser/<id>   |
              +---------------------------+
                    |          |
          Only ONE active at a time
                    |          |
         +----------+    +-----------+
         | Stagehand |    | Magnitude |
         | (via      |    | (via      |
         | Playwright|    | Playwright|
         | CDP)      |    | CDP)      |
         +-----------+    +-----------+
```

### Why CDP Works for Both

| Engine     | CDP Connection Method                                     | Underlying Library |
|------------|-----------------------------------------------------------|--------------------|
| Stagehand  | `new Stagehand({ env: "LOCAL", localBrowserLaunchOptions: { cdpUrl } })` | Playwright         |
| Magnitude  | `startBrowserAgent({ browser: { cdp: cdpUrl } })`        | Playwright         |

Both use Playwright under the hood, and Playwright's `connectOverCDP` establishes a WebSocket to the browser's CDP server. Disconnection is clean -- closing the Playwright browser context does NOT terminate the browser process, it only drops the WebSocket connection.

### CDP Lifecycle Rules

1. **Browser start** returns `{ cdpUrl, port, pid }` from AdsPower API
2. **Engine connect** opens a WebSocket to `cdpUrl`
3. **Engine disconnect** closes the WebSocket (browser survives)
4. **Browser stop** terminates the process (only on workflow completion)

---

## 3. SandboxController Full Implementation

### File Location

```
apps/worker/src/services/sandbox-controller.ts
```

### Dependencies

```json
{
  "@anthropic-ai/stagehand": "^3.x",
  "magnitude-core": "^0.x",
  "async-mutex": "^0.5.0"
}
```

### Types

```typescript
// apps/worker/src/services/sandbox-controller.types.ts

import type { Stagehand } from "@anthropic-ai/stagehand";
import type { BrowserAgent } from "magnitude-core";

export type EngineType = "stagehand" | "magnitude" | "human" | "none";

export type StagehandMode = "dom" | "cua";

export interface EngineConfig {
  /** Max consecutive failures before triggering a switch */
  maxFailures: number;
  /** Timeout for a single operation (ms) */
  operationTimeoutMs: number;
  /** Minimum confidence score to accept an action result */
  confidenceThreshold: number;
  /** Max retries within the same engine before escalating */
  retryCount: number;
}

export interface SandboxConfig {
  adsPowerBaseUrl: string;
  profileId: string;
  engines: {
    stagehand: EngineConfig;
    magnitude: EngineConfig;
  };
  /** LLM model for Stagehand (e.g. "anthropic/claude-sonnet-4-5-20250514") */
  stagehandModel: string;
  /** LLM model for Magnitude */
  magnitudeModel?: string;
  /** Enable VNC on profile start */
  enableVnc: boolean;
}

export interface PageState {
  url: string;
  title: string;
  scrollX: number;
  scrollY: number;
  timestamp: string;
}

export interface EngineSwitchEvent {
  from: EngineType;
  to: EngineType;
  reason: string;
  pageState: PageState;
  durationMs: number;
  success: boolean;
  timestamp: string;
}

export interface EngineHandle {
  type: EngineType;
  stagehand?: Stagehand;
  magnitude?: BrowserAgent;
  connectedAt: string;
  failureCount: number;
}
```

### Full Implementation

```typescript
// apps/worker/src/services/sandbox-controller.ts

import { Stagehand } from "@anthropic-ai/stagehand";
import { startBrowserAgent, type BrowserAgent } from "magnitude-core";
import { Mutex } from "async-mutex";
import pino from "pino";
import type {
  EngineType,
  StagehandMode,
  SandboxConfig,
  PageState,
  EngineSwitchEvent,
  EngineHandle,
} from "./sandbox-controller.types.js";
import type { BrowserSession } from "@valet/shared/types";

const logger = pino({ name: "sandbox-controller" });

export class SandboxController {
  private config: SandboxConfig;
  private session: BrowserSession | null = null;
  private currentEngine: EngineHandle | null = null;
  private cdpUrl: string | null = null;
  private vncEnabled = false;
  private switchHistory: EngineSwitchEvent[] = [];

  /** Mutex prevents concurrent engine connect/disconnect/switch */
  private readonly cdpMutex = new Mutex();

  /** Track whether the controller has been torn down */
  private stopped = false;

  constructor(config: SandboxConfig) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // Profile Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the AdsPower browser profile and obtain the CDP URL.
   * Does NOT connect an engine -- call connectStagehand() or
   * connectMagnitude() after this.
   */
  async startProfile(): Promise<BrowserSession> {
    if (this.stopped) throw new Error("SandboxController has been stopped");
    if (this.session) {
      logger.warn("Profile already started, returning existing session");
      return this.session;
    }

    const url = `${this.config.adsPowerBaseUrl}/api/v1/browser/start`;
    const params = new URLSearchParams({
      serial_number: this.config.profileId,
      ip_tab: "0", // do not open default page
      headless: "0",
    });

    if (this.config.enableVnc) {
      params.set("open_tabs", "0");
    }

    logger.info({ profileId: this.config.profileId }, "Starting AdsPower profile");

    const response = await fetch(`${url}?${params.toString()}`);
    const body = (await response.json()) as {
      code: number;
      msg: string;
      data: {
        ws: { puppeteer: string; selenium: string };
        debug_port: string;
        webdriver: string;
      };
    };

    if (body.code !== 0) {
      throw new Error(`AdsPower start failed: ${body.msg}`);
    }

    // AdsPower returns puppeteer WS endpoint
    this.cdpUrl = body.data.ws.puppeteer;
    const port = parseInt(body.data.debug_port, 10);

    this.session = {
      profileId: this.config.profileId,
      cdpUrl: this.cdpUrl,
      port,
      pid: 0, // AdsPower manages PID internally
      startedAt: new Date().toISOString(),
    };

    this.vncEnabled = this.config.enableVnc;

    logger.info(
      { profileId: this.config.profileId, port, cdpUrl: this.cdpUrl },
      "AdsPower profile started",
    );

    return this.session;
  }

  /**
   * Stop the AdsPower browser profile. Disconnects any active engine first.
   */
  async stopProfile(): Promise<void> {
    if (!this.session) return;

    // Disconnect engine if active
    await this.disconnectCurrentEngine();

    const url = `${this.config.adsPowerBaseUrl}/api/v1/browser/stop`;
    const params = new URLSearchParams({
      serial_number: this.config.profileId,
    });

    logger.info({ profileId: this.config.profileId }, "Stopping AdsPower profile");

    const response = await fetch(`${url}?${params.toString()}`);
    const body = (await response.json()) as { code: number; msg: string };

    if (body.code !== 0) {
      logger.error({ msg: body.msg }, "AdsPower stop returned error");
    }

    this.session = null;
    this.cdpUrl = null;
    this.vncEnabled = false;
  }

  // -----------------------------------------------------------------------
  // Engine Connection
  // -----------------------------------------------------------------------

  /**
   * Connect Stagehand to the running browser via CDP.
   * Acquires the CDP mutex to prevent concurrent connections.
   */
  async connectStagehand(mode: StagehandMode = "dom"): Promise<Stagehand> {
    return this.cdpMutex.runExclusive(async () => {
      this.ensureSessionReady();

      if (this.currentEngine?.type === "stagehand" && this.currentEngine.stagehand) {
        logger.warn("Stagehand already connected, returning existing instance");
        return this.currentEngine.stagehand;
      }

      // Disconnect any existing engine first
      await this.disconnectCurrentEngineUnsafe();

      logger.info({ cdpUrl: this.cdpUrl, mode }, "Connecting Stagehand");

      const stagehand = new Stagehand({
        env: "LOCAL",
        localBrowserLaunchOptions: {
          cdpUrl: this.cdpUrl!,
        },
        model: this.config.stagehandModel,
        verbose: 1,
        selfHeal: true,
        domSettleTimeout: 3000,
      });

      await stagehand.init();

      this.currentEngine = {
        type: "stagehand",
        stagehand,
        connectedAt: new Date().toISOString(),
        failureCount: 0,
      };

      logger.info("Stagehand connected successfully");
      return stagehand;
    });
  }

  /**
   * Connect Magnitude to the running browser via CDP.
   * Acquires the CDP mutex to prevent concurrent connections.
   */
  async connectMagnitude(): Promise<BrowserAgent> {
    return this.cdpMutex.runExclusive(async () => {
      this.ensureSessionReady();

      if (this.currentEngine?.type === "magnitude" && this.currentEngine.magnitude) {
        logger.warn("Magnitude already connected, returning existing instance");
        return this.currentEngine.magnitude;
      }

      // Disconnect any existing engine first
      await this.disconnectCurrentEngineUnsafe();

      logger.info({ cdpUrl: this.cdpUrl }, "Connecting Magnitude");

      const agent = await startBrowserAgent({
        browser: {
          cdp: this.cdpUrl!,
        },
        ...(this.config.magnitudeModel
          ? { llm: { model: this.config.magnitudeModel } }
          : {}),
      });

      this.currentEngine = {
        type: "magnitude",
        magnitude: agent,
        connectedAt: new Date().toISOString(),
        failureCount: 0,
      };

      logger.info("Magnitude connected successfully");
      return agent;
    });
  }

  // -----------------------------------------------------------------------
  // Engine Switching
  // -----------------------------------------------------------------------

  /**
   * Switch from the current engine to a different one.
   * Captures page state, disconnects current, verifies browser health,
   * connects new engine, and resumes from captured state.
   */
  async switchEngine(
    targetEngine: EngineType,
    reason: string,
  ): Promise<EngineHandle> {
    const switchStart = Date.now();
    const fromEngine = this.currentEngine?.type ?? "none";

    logger.info({ from: fromEngine, to: targetEngine, reason }, "Switching engine");

    // Step 1: Capture current page state before disconnecting
    let pageState: PageState;
    try {
      pageState = await this.capturePageState();
    } catch (err) {
      logger.warn({ err }, "Failed to capture page state, using fallback");
      pageState = {
        url: "about:blank",
        title: "",
        scrollX: 0,
        scrollY: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // Step 2: Disconnect current engine (acquires mutex internally)
    await this.disconnectCurrentEngine();

    // Step 3: Verify browser is still alive
    const alive = await this.verifyBrowserAlive();
    if (!alive) {
      const event: EngineSwitchEvent = {
        from: fromEngine,
        to: targetEngine,
        reason,
        pageState,
        durationMs: Date.now() - switchStart,
        success: false,
        timestamp: new Date().toISOString(),
      };
      this.switchHistory.push(event);
      throw new Error("Browser died during engine switch -- cannot recover");
    }

    // Step 4: Connect the new engine
    try {
      if (targetEngine === "stagehand") {
        await this.connectStagehand();
      } else if (targetEngine === "magnitude") {
        await this.connectMagnitude();
      } else if (targetEngine === "human") {
        // Human takeover: no engine to connect, just enable VNC
        await this.enableVnc();
        this.currentEngine = {
          type: "human",
          connectedAt: new Date().toISOString(),
          failureCount: 0,
        };
      } else {
        throw new Error(`Unknown engine type: ${targetEngine}`);
      }
    } catch (err) {
      const event: EngineSwitchEvent = {
        from: fromEngine,
        to: targetEngine,
        reason,
        pageState,
        durationMs: Date.now() - switchStart,
        success: false,
        timestamp: new Date().toISOString(),
      };
      this.switchHistory.push(event);
      throw err;
    }

    // Step 5: Restore page state if the new engine navigated away
    await this.restorePageState(pageState);

    // Step 6: Verify the new engine can access the page
    await this.verifyEngineConnected();

    const event: EngineSwitchEvent = {
      from: fromEngine,
      to: targetEngine,
      reason,
      pageState,
      durationMs: Date.now() - switchStart,
      success: true,
      timestamp: new Date().toISOString(),
    };
    this.switchHistory.push(event);

    logger.info(
      { from: fromEngine, to: targetEngine, durationMs: event.durationMs },
      "Engine switch completed",
    );

    return this.currentEngine!;
  }

  // -----------------------------------------------------------------------
  // State Accessors
  // -----------------------------------------------------------------------

  getCurrentEngine(): EngineType {
    return this.currentEngine?.type ?? "none";
  }

  getEngineHandle(): EngineHandle | null {
    return this.currentEngine;
  }

  getStagehand(): Stagehand | null {
    return this.currentEngine?.stagehand ?? null;
  }

  getMagnitude(): BrowserAgent | null {
    return this.currentEngine?.magnitude ?? null;
  }

  getCdpUrl(): string | null {
    return this.cdpUrl;
  }

  getSession(): BrowserSession | null {
    return this.session;
  }

  getSwitchHistory(): EngineSwitchEvent[] {
    return [...this.switchHistory];
  }

  // -----------------------------------------------------------------------
  // VNC Management
  // -----------------------------------------------------------------------

  getVncUrl(): string | null {
    if (!this.session || !this.vncEnabled) return null;
    // VNC URL constructed from the session's port mapping
    // websockify runs on port = session.port + 1000
    const wsPort = this.session.port + 1000;
    return `wss://localhost:${wsPort}/websockify`;
  }

  async enableVnc(): Promise<string> {
    this.ensureSessionReady();
    if (this.vncEnabled) return this.getVncUrl()!;

    // AdsPower API to enable VNC for the running profile
    // In Fly Machines deployment, this would be a sidecar process
    logger.info({ profileId: this.config.profileId }, "Enabling VNC");
    this.vncEnabled = true;

    const vncUrl = this.getVncUrl();
    if (!vncUrl) throw new Error("Failed to construct VNC URL");

    logger.info({ vncUrl }, "VNC enabled");
    return vncUrl;
  }

  async disableVnc(): Promise<void> {
    if (!this.vncEnabled) return;
    logger.info({ profileId: this.config.profileId }, "Disabling VNC");
    this.vncEnabled = false;
  }

  // -----------------------------------------------------------------------
  // Full Teardown
  // -----------------------------------------------------------------------

  /**
   * Stop everything: disconnect engine, stop profile, mark as stopped.
   * Safe to call multiple times.
   */
  async stopAll(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    logger.info("Stopping all sandbox resources");

    try {
      await this.disconnectCurrentEngine();
    } catch (err) {
      logger.error({ err }, "Error disconnecting engine during stopAll");
    }

    try {
      await this.disableVnc();
    } catch (err) {
      logger.error({ err }, "Error disabling VNC during stopAll");
    }

    try {
      await this.stopProfile();
    } catch (err) {
      logger.error({ err }, "Error stopping profile during stopAll");
    }

    logger.info("All sandbox resources stopped");
  }

  // -----------------------------------------------------------------------
  // Failure Tracking
  // -----------------------------------------------------------------------

  /**
   * Record an engine failure. Returns the new failure count.
   * Callers use this to decide when to trigger a switch.
   */
  recordFailure(): number {
    if (!this.currentEngine) return 0;
    this.currentEngine.failureCount += 1;
    logger.warn(
      {
        engine: this.currentEngine.type,
        failureCount: this.currentEngine.failureCount,
      },
      "Engine failure recorded",
    );
    return this.currentEngine.failureCount;
  }

  /**
   * Check if the current engine has exceeded its failure threshold.
   */
  shouldSwitch(): boolean {
    if (!this.currentEngine) return false;
    const engineType = this.currentEngine.type;
    if (engineType === "human" || engineType === "none") return false;

    const config = this.config.engines[engineType as "stagehand" | "magnitude"];
    if (!config) return false;

    return this.currentEngine.failureCount >= config.maxFailures;
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  private ensureSessionReady(): void {
    if (this.stopped) throw new Error("SandboxController has been stopped");
    if (!this.session || !this.cdpUrl) {
      throw new Error("No active browser session -- call startProfile() first");
    }
  }

  /**
   * Disconnect current engine WITHOUT acquiring the mutex.
   * Called from within mutex-protected methods.
   */
  private async disconnectCurrentEngineUnsafe(): Promise<void> {
    if (!this.currentEngine) return;

    const engine = this.currentEngine;
    this.currentEngine = null;

    try {
      if (engine.stagehand) {
        logger.info("Disconnecting Stagehand");
        await engine.stagehand.close();
      }
      if (engine.magnitude) {
        logger.info("Disconnecting Magnitude");
        await engine.magnitude.stop();
      }
    } catch (err) {
      // Log but do not throw -- the engine may already be in a bad state
      logger.error({ err, engine: engine.type }, "Error during engine disconnect");
    }
  }

  /**
   * Disconnect current engine. Acquires the CDP mutex.
   */
  private async disconnectCurrentEngine(): Promise<void> {
    await this.cdpMutex.runExclusive(async () => {
      await this.disconnectCurrentEngineUnsafe();
    });
  }

  /**
   * Capture the current page state using a raw CDP call.
   * Works regardless of which engine is connected because we
   * hit the CDP endpoint directly.
   */
  private async capturePageState(): Promise<PageState> {
    this.ensureSessionReady();

    // Use raw CDP to get page state (engine-independent)
    const cdpHttpUrl = this.cdpUrl!.replace("ws://", "http://").replace(/\/devtools.*/, "");
    const response = await fetch(`${cdpHttpUrl}/json/list`);
    const targets = (await response.json()) as Array<{
      url: string;
      title: string;
      webSocketDebuggerUrl: string;
      type: string;
    }>;

    const page = targets.find((t) => t.type === "page");
    if (!page) {
      throw new Error("No page target found in CDP");
    }

    // Scroll position requires evaluating JS on the page.
    // We can do this via the engine if it is still connected,
    // or fall back to 0,0.
    let scrollX = 0;
    let scrollY = 0;

    if (this.currentEngine?.stagehand) {
      try {
        const page_ = this.currentEngine.stagehand.page;
        const scroll = await page_.evaluate(() => ({
          x: window.scrollX,
          y: window.scrollY,
        }));
        scrollX = scroll.x;
        scrollY = scroll.y;
      } catch {
        // Engine may already be broken
      }
    } else if (this.currentEngine?.magnitude) {
      try {
        const page_ = this.currentEngine.magnitude.page;
        const scroll = await page_.evaluate(() => ({
          x: window.scrollX,
          y: window.scrollY,
        }));
        scrollX = scroll.x;
        scrollY = scroll.y;
      } catch {
        // Engine may already be broken
      }
    }

    return {
      url: page.url,
      title: page.title,
      scrollX,
      scrollY,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verify the browser process is still alive by pinging the CDP endpoint.
   */
  private async verifyBrowserAlive(): Promise<boolean> {
    if (!this.cdpUrl) return false;

    try {
      const cdpHttpUrl = this.cdpUrl
        .replace("ws://", "http://")
        .replace(/\/devtools.*/, "");
      const response = await fetch(`${cdpHttpUrl}/json/version`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * After connecting a new engine, verify it can access the page.
   */
  private async verifyEngineConnected(): Promise<void> {
    if (!this.currentEngine) return;

    if (this.currentEngine.stagehand) {
      const url = await this.currentEngine.stagehand.page.url();
      logger.info({ url }, "Stagehand verified -- page accessible");
    } else if (this.currentEngine.magnitude) {
      // Magnitude's page property gives us the Playwright page
      const url = this.currentEngine.magnitude.page.url();
      logger.info({ url }, "Magnitude verified -- page accessible");
    }
    // Human mode: no verification needed
  }

  /**
   * Restore page state after switching engines. If the new engine
   * shows a different URL, navigate back and scroll.
   */
  private async restorePageState(state: PageState): Promise<void> {
    if (!this.currentEngine || state.url === "about:blank") return;

    let currentUrl: string | undefined;

    if (this.currentEngine.stagehand) {
      currentUrl = await this.currentEngine.stagehand.page.url();
      if (currentUrl !== state.url) {
        await this.currentEngine.stagehand.page.goto(state.url, {
          waitUntil: "domcontentloaded",
        });
      }
      if (state.scrollX !== 0 || state.scrollY !== 0) {
        await this.currentEngine.stagehand.page.evaluate(
          ([x, y]) => window.scrollTo(x, y),
          [state.scrollX, state.scrollY] as const,
        );
      }
    } else if (this.currentEngine.magnitude) {
      currentUrl = this.currentEngine.magnitude.page.url();
      if (currentUrl !== state.url) {
        await this.currentEngine.magnitude.nav(state.url);
      }
      if (state.scrollX !== 0 || state.scrollY !== 0) {
        await this.currentEngine.magnitude.page.evaluate(
          ([x, y]) => window.scrollTo(x, y),
          [state.scrollX, state.scrollY] as const,
        );
      }
    }
  }
}
```

---

## 4. Engine Switching Protocol

The switch protocol is an 8-step sequence. Each step has a defined failure mode and recovery action.

### Step-by-Step Sequence

```
 Step 1        Step 2        Step 3         Step 4          Step 5
 Detect     -> Decide     -> Capture     -> Disconnect  -> Verify
 Failure       to Switch     Page State     Current        Browser
                                            Engine         Alive
    |             |              |              |              |
    v             v              v              v              v
 Record       Check          Get URL,       Close CDP      HTTP GET
 failure,     threshold      title, scroll  client only,   /json/version
 increment    exceeded?      via CDP or     NOT the        -> must return
 counter      or forced?     page.evaluate  browser        200
    |             |              |              |              |
    v             v              v              v              v
 Step 6        Step 7        Step 8
 Connect    -> Verify     -> Resume
 New           New           from
 Engine        Engine        Captured State
    |             |              |
    v             v              v
 Stagehand   page.url()     Navigate to
 .init() or  returns        saved URL if
 startAgent  valid URL      different,
                             restore scroll
```

### Failure Modes per Step

| Step | Failure | Recovery |
|------|---------|----------|
| 1 - Detect | Operation timeout or exception | Log, increment failure counter |
| 2 - Decide | N/A (pure logic) | N/A |
| 3 - Capture state | Engine too broken to evaluate JS | Use URL from CDP `/json/list`, scroll defaults to 0,0 |
| 4 - Disconnect | `close()` or `stop()` throws | Catch and ignore -- engine is already broken |
| 5 - Browser alive | CDP ping fails | Abort switch, throw unrecoverable error, workflow must restart |
| 6 - Connect new | `init()` or `startBrowserAgent()` fails | Try next engine in fallback cascade |
| 7 - Verify | Page URL inaccessible | Retry connect once, then escalate |
| 8 - Resume | Navigation or scroll fails | Log warning, continue from current state |

### Decision Criteria for Triggering a Switch

```typescript
interface SwitchDecision {
  shouldSwitch: boolean;
  reason: string;
  targetEngine: EngineType;
}

function evaluateSwitchCriteria(
  controller: SandboxController,
  error: Error | null,
  operationDurationMs: number,
  confidenceScore?: number,
): SwitchDecision {
  const handle = controller.getEngineHandle();
  if (!handle) return { shouldSwitch: false, reason: "", targetEngine: "none" };

  const engineKey = handle.type as "stagehand" | "magnitude";
  const config = controller["config"].engines[engineKey];
  if (!config) return { shouldSwitch: false, reason: "", targetEngine: "none" };

  // Criterion 1: Consecutive failure count exceeded
  if (handle.failureCount >= config.maxFailures) {
    return {
      shouldSwitch: true,
      reason: `${handle.failureCount} consecutive failures (threshold: ${config.maxFailures})`,
      targetEngine: getNextEngine(handle.type),
    };
  }

  // Criterion 2: Operation timeout exceeded
  if (operationDurationMs > config.operationTimeoutMs) {
    return {
      shouldSwitch: true,
      reason: `Operation took ${operationDurationMs}ms (timeout: ${config.operationTimeoutMs}ms)`,
      targetEngine: getNextEngine(handle.type),
    };
  }

  // Criterion 3: Low confidence score
  if (confidenceScore !== undefined && confidenceScore < config.confidenceThreshold) {
    return {
      shouldSwitch: true,
      reason: `Confidence ${confidenceScore} below threshold ${config.confidenceThreshold}`,
      targetEngine: getNextEngine(handle.type),
    };
  }

  return { shouldSwitch: false, reason: "", targetEngine: "none" };
}

function getNextEngine(current: EngineType): EngineType {
  // Follow the fallback cascade
  switch (current) {
    case "stagehand": return "magnitude";
    case "magnitude": return "human";
    default: return "human";
  }
}
```

---

## 5. Session State Preservation

### What Survives an Engine Switch

The browser process continues running across switches. Everything that lives in the browser survives:

| State | Survives? | Reason |
|-------|-----------|--------|
| Cookies | Yes | Stored in browser process |
| localStorage / sessionStorage | Yes | Stored in browser process |
| IndexedDB | Yes | Stored in browser process |
| Current URL | Yes | Page remains loaded |
| DOM state | Yes | Page is still rendered |
| Form field values | Yes | DOM nodes persist |
| Scroll position | Yes | Browser maintains it |
| Page JavaScript state | Yes | JS heap is in the browser |
| Authentication sessions | Yes | Cookie/token-based |
| Open tabs | Yes | Browser process owns them |

### What Does NOT Survive

| State | Survives? | Mitigation |
|-------|-----------|------------|
| Engine-internal element cache | No | Re-observe/re-analyze after switch |
| Stagehand action history | No | Store externally in workflow context |
| Magnitude agent memory | No | Agent re-initializes with instructions |
| Playwright page event listeners | No | Re-attach in post-connect hook |
| In-flight network interceptors | No | Re-register if needed |
| Engine-specific retry counters | No | Tracked in SandboxController |
| Element references (selectors) | No | Re-discover via observe/act after switch |

### Handling State Loss

```typescript
interface PostSwitchRecovery {
  /**
   * After switching engines, re-establish context by:
   * 1. Verifying we are on the expected URL
   * 2. Re-analyzing the current form/page structure
   * 3. Re-identifying where we are in the multi-page flow
   */
  async recoverContext(
    controller: SandboxController,
    savedState: PageState,
    workflowStep: string,
  ): Promise<void>;
}
```

The `recoverContext` function should:
1. Compare current URL with saved URL, navigate if different
2. Call the platform adapter's `detectPlatform()` to re-identify the ATS
3. Call `getFormFlow()` to re-analyze page structure
4. Determine which page of a multi-step form we're on
5. Log the recovery as a `task_event` with type `engine_switch_recovery`

---

## 6. Concurrency Control

### The Problem

CDP WebSocket only supports one automation client at a time. If Stagehand is connected and we try to connect Magnitude simultaneously, both will see corrupted state.

### Solution: async-mutex

```typescript
import { Mutex, withTimeout } from "async-mutex";

// In SandboxController constructor:
private readonly cdpMutex = new Mutex();

// Every operation that touches the CDP connection must go through:
await this.cdpMutex.runExclusive(async () => {
  // ... connect, disconnect, or switch
});
```

### Mutex Timeout

If a previous operation is hung (e.g., Stagehand `init()` is stuck), we need a timeout:

```typescript
import { withTimeout } from "async-mutex";

// Wrap with a 30-second timeout
private readonly cdpMutex = withTimeout(new Mutex(), 30_000, new Error(
  "CDP mutex timeout: another operation held the lock for >30s"
));
```

### Invariants

1. **At most one engine connected** -- enforced by `disconnectCurrentEngineUnsafe()` being called before every new connection inside the mutex.
2. **No concurrent connect/disconnect** -- the mutex serializes all connection lifecycle operations.
3. **Timeout prevents deadlock** -- if a connection hangs, the mutex times out and the caller can decide to force-kill.
4. **Engine methods are NOT mutex-protected** -- once connected, `act()`, `observe()`, `extract()` etc. can be called freely. The mutex only protects connection lifecycle.

### Force-Release Pattern

```typescript
/**
 * Emergency release: force-disconnect everything without waiting for
 * graceful shutdown. Used when the workflow is being cancelled.
 */
async forceRelease(): Promise<void> {
  // Cancel the mutex -- any waiting acquirers will get an error
  this.cdpMutex.cancel();

  // Null out the engine handle immediately
  const engine = this.currentEngine;
  this.currentEngine = null;

  // Best-effort cleanup
  try { await engine?.stagehand?.close(); } catch { /* ignore */ }
  try { await engine?.magnitude?.stop(); } catch { /* ignore */ }
}
```

---

## 7. Fallback Cascade

### Decision Tree

```
                    Operation Requested
                          |
                          v
              +------ Stagehand DOM Mode ------+
              |   (fast, cheap, text-based)     |
              |                                 |
           Success                           Fail
              |                      (retry up to N times)
              v                                 |
           Return                               v
           Result                  +--- Stagehand CUA Mode ---+
                                   | (coordinate-based, uses  |
                                   |  vision, more expensive)  |
                                   |                           |
                                Success                     Fail
                                   |                 (retry up to M times)
                                   v                           |
                                Return                         v
                                Result              +--- Magnitude ---+
                                                    |  (vision-first, |
                                                    |  different DOM   |
                                                    |  understanding)  |
                                                    |                  |
                                                 Success            Fail
                                                    |        (retry up to K times)
                                                    v                  |
                                                 Return                v
                                                 Result     +-- Human Takeover --+
                                                            | (VNC, user solves  |
                                                            |  via noVNC panel)  |
                                                            +--------------------+
```

### Configuration

```typescript
interface FallbackCascadeConfig {
  levels: FallbackLevel[];
  /** Total timeout across all levels (ms) */
  totalTimeoutMs: number;
}

interface FallbackLevel {
  engine: EngineType;
  mode?: StagehandMode; // only for stagehand
  retryCount: number;
  timeoutPerAttemptMs: number;
  /** Optional: skip this level for certain platforms */
  skipForPlatforms?: Platform[];
}

const DEFAULT_CASCADE: FallbackCascadeConfig = {
  totalTimeoutMs: 300_000, // 5 minutes total
  levels: [
    {
      engine: "stagehand",
      mode: "dom",
      retryCount: 2,
      timeoutPerAttemptMs: 15_000,
    },
    {
      engine: "stagehand",
      mode: "cua",
      retryCount: 1,
      timeoutPerAttemptMs: 30_000,
      skipForPlatforms: [], // CUA works everywhere
    },
    {
      engine: "magnitude",
      retryCount: 2,
      timeoutPerAttemptMs: 30_000,
    },
    {
      engine: "human",
      retryCount: 1,
      timeoutPerAttemptMs: 120_000, // 2 min for human
    },
  ],
};
```

### Cascade Executor

```typescript
async function executeWithFallback<T>(
  controller: SandboxController,
  cascade: FallbackCascadeConfig,
  operation: (engine: EngineHandle) => Promise<T>,
  context: { taskId: string; step: string },
): Promise<T> {
  const totalDeadline = Date.now() + cascade.totalTimeoutMs;

  for (const level of cascade.levels) {
    if (Date.now() > totalDeadline) {
      throw new Error(`Fallback cascade total timeout exceeded (${cascade.totalTimeoutMs}ms)`);
    }

    // Switch engine if needed
    const currentEngine = controller.getCurrentEngine();
    if (currentEngine !== level.engine) {
      await controller.switchEngine(
        level.engine,
        `Cascade escalation to ${level.engine}`,
      );
    }

    // Retry within this level
    for (let attempt = 0; attempt <= level.retryCount; attempt++) {
      try {
        const handle = controller.getEngineHandle()!;
        const result = await Promise.race([
          operation(handle),
          rejectAfterTimeout(level.timeoutPerAttemptMs),
        ]);
        return result as T;
      } catch (err) {
        controller.recordFailure();
        logger.warn(
          {
            engine: level.engine,
            attempt,
            maxRetries: level.retryCount,
            err: (err as Error).message,
          },
          "Operation failed, retrying or escalating",
        );
      }
    }

    // All retries exhausted at this level, fall through to next
    logger.info(
      { engine: level.engine, step: context.step },
      "All retries exhausted, escalating to next level",
    );
  }

  throw new Error("All fallback levels exhausted");
}

function rejectAfterTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms),
  );
}
```

---

## 8. Engine Selection Logic

Different ATS platforms have different DOM structures. The initial engine choice should be tuned per-platform to minimize unnecessary switches.

### Platform-to-Engine Mapping

| Platform | Primary Engine | Reason | Fallback Order |
|----------|---------------|--------|----------------|
| LinkedIn Easy Apply | Stagehand DOM | Well-known DOM, consistent structure, few shadow DOM elements | Stagehand CUA -> Magnitude -> Human |
| Greenhouse | Stagehand DOM | Standard HTML forms, good label/input pairing | Stagehand CUA -> Magnitude -> Human |
| Lever | Stagehand DOM | Clean React-based forms | Stagehand CUA -> Magnitude -> Human |
| Workday | Magnitude | Heavy shadow DOM, custom web components, dynamic rendering breaks DOM selectors | Stagehand CUA -> Human |
| Unknown ATS | Stagehand DOM | Start cheap, escalate as needed | Stagehand CUA -> Magnitude -> Human |

### Selection Function

```typescript
import type { Platform } from "@valet/shared/types";

interface EngineSelection {
  primary: EngineType;
  primaryMode?: StagehandMode;
  cascade: FallbackCascadeConfig;
}

function selectEngine(platform: Platform): EngineSelection {
  switch (platform) {
    case "linkedin":
    case "greenhouse":
    case "lever":
      return {
        primary: "stagehand",
        primaryMode: "dom",
        cascade: DEFAULT_CASCADE,
      };

    case "workday":
      return {
        primary: "magnitude",
        cascade: {
          totalTimeoutMs: 300_000,
          levels: [
            {
              engine: "magnitude",
              retryCount: 3,
              timeoutPerAttemptMs: 30_000,
            },
            {
              engine: "stagehand",
              mode: "cua",
              retryCount: 1,
              timeoutPerAttemptMs: 30_000,
            },
            {
              engine: "human",
              retryCount: 1,
              timeoutPerAttemptMs: 120_000,
            },
          ],
        },
      };

    case "unknown":
    default:
      return {
        primary: "stagehand",
        primaryMode: "dom",
        cascade: DEFAULT_CASCADE,
      };
  }
}
```

### Adaptive Learning (Future)

Track success/failure rates per platform per engine in the database:

```sql
SELECT
  platform,
  engine,
  COUNT(*) FILTER (WHERE success = true) AS successes,
  COUNT(*) FILTER (WHERE success = false) AS failures,
  ROUND(
    COUNT(*) FILTER (WHERE success = true)::numeric /
    NULLIF(COUNT(*), 0), 3
  ) AS success_rate
FROM task_events
WHERE event_type = 'engine_operation'
GROUP BY platform, engine
ORDER BY platform, success_rate DESC;
```

This data can inform dynamic engine selection: if Magnitude starts succeeding more on LinkedIn than Stagehand, the selection logic can adapt.

---

## 9. Cross-Task Engine Sharing

### Problem

The Hatchet job-application workflow has 7 sequential tasks: `start-browser` -> `analyze-form` -> `fill-fields` -> `upload-resume` -> `check-captcha` -> `submit` -> `verify`. The SandboxController and its connected engine must persist across all of them.

### Hatchet Context Passing

Hatchet tasks communicate via return values and `ctx.parentOutput()`. However, **live object instances (Stagehand, Playwright pages) cannot be serialized**. The SandboxController must be instantiated once and shared via closure.

### Implementation Pattern

```typescript
// apps/worker/src/workflows/job-application.ts

import { SandboxController } from "../services/sandbox-controller.js";
import type { SandboxConfig } from "../services/sandbox-controller.types.js";

export function registerJobApplicationWorkflow(
  hatchet: Hatchet,
  redis: Redis,
  eventLogger: EventLogger,
  db?: Database,
) {
  const workflow = hatchet.workflow<WorkflowInput>({
    name: "job-application",
    onEvents: ["task:created"],
  });

  // ---------------------------------------------------------------
  // SandboxController is created in start-browser and lives in
  // the closure. All subsequent tasks access it via the closure,
  // NOT via serialized parentOutput.
  // ---------------------------------------------------------------
  let sandbox: SandboxController | null = null;

  const startBrowser = workflow.task({
    name: "start-browser",
    executionTimeout: "60s",
    fn: async (input: WorkflowInput, ctx: Context<WorkflowInput>) => {
      const config: SandboxConfig = {
        adsPowerBaseUrl: process.env.ADSPOWER_API_URL ?? "http://127.0.0.1:50325",
        profileId: input.profileId ?? "default",
        engines: {
          stagehand: {
            maxFailures: 3,
            operationTimeoutMs: 15_000,
            confidenceThreshold: 0.6,
            retryCount: 2,
          },
          magnitude: {
            maxFailures: 3,
            operationTimeoutMs: 30_000,
            confidenceThreshold: 0.5,
            retryCount: 2,
          },
        },
        stagehandModel: "anthropic/claude-sonnet-4-5-20250514",
        enableVnc: true,
      };

      sandbox = new SandboxController(config);
      const session = await sandbox.startProfile();
      await sandbox.connectStagehand();

      return {
        browserReady: true,
        cdpUrl: session.cdpUrl,
        engine: sandbox.getCurrentEngine(),
      };
    },
  });

  const analyzeForm = workflow.task({
    name: "analyze-form",
    executionTimeout: "30s",
    parents: [startBrowser],
    fn: async (input: WorkflowInput, ctx: Context<WorkflowInput>) => {
      if (!sandbox) throw new Error("SandboxController not initialized");

      const stagehand = sandbox.getStagehand();
      if (!stagehand) throw new Error("No Stagehand instance available");

      // Navigate to the job URL
      await stagehand.page.goto(input.jobUrl, { waitUntil: "domcontentloaded" });

      // Use Stagehand to analyze the form
      const formData = await stagehand.extract(
        "Extract all form fields on this job application page",
        { /* zod schema */ },
      );

      return { platform: "linkedin", formData };
    },
  });

  const fillFields = workflow.task({
    name: "fill-fields",
    executionTimeout: "120s",
    parents: [analyzeForm],
    fn: async (input: WorkflowInput, ctx: Context<WorkflowInput>) => {
      if (!sandbox) throw new Error("SandboxController not initialized");

      // The fallback cascade wraps each operation
      const result = await executeWithFallback(
        sandbox,
        DEFAULT_CASCADE,
        async (handle) => {
          if (handle.stagehand) {
            return handle.stagehand.act("Fill in the first name field with 'John'");
          }
          if (handle.magnitude) {
            return handle.magnitude.act("Fill in the first name field with 'John'");
          }
          throw new Error("No engine available");
        },
        { taskId: input.taskId, step: "fill-fields" },
      );

      return { filled: true };
    },
  });

  // ... submit, verify tasks follow same pattern ...

  // Cleanup task runs last (or on workflow failure)
  workflow.task({
    name: "cleanup",
    executionTimeout: "30s",
    parents: [/* verify or all tasks */],
    fn: async () => {
      if (sandbox) {
        await sandbox.stopAll();
        sandbox = null;
      }
    },
  });

  return workflow;
}
```

### Important: Hatchet Worker Thread Model

Hatchet runs workflow tasks in the same Node.js process. The closure-based approach works because:

1. `start-browser` creates `sandbox` and assigns it
2. Subsequent tasks run sequentially (parent dependencies)
3. All tasks share the same V8 heap and closure scope
4. The `sandbox` variable is accessible to all tasks

If Hatchet ever runs tasks in separate processes (e.g., with workers across machines), the SandboxController would need to serialize its connection state (CDP URL, profile ID) and reconstruct on the other side. The `cdpUrl` is the key -- a new SandboxController can be created with the same `cdpUrl` to resume.

---

## 10. Monitoring & Metrics

### Events to Track

| Metric | Type | Stored In | Description |
|--------|------|-----------|-------------|
| `engine_connected` | event | `task_events` | Engine connected to CDP, with engine type and mode |
| `engine_disconnected` | event | `task_events` | Engine disconnected, with reason and duration |
| `engine_switch` | event | `task_events` | Full switch event with from/to/reason/duration |
| `engine_failure` | event | `task_events` | Individual operation failure with error details |
| `engine_operation` | event | `task_events` | Successful operation with duration and confidence |
| `cascade_escalation` | event | `task_events` | Escalation from one cascade level to the next |
| `human_takeover` | event | `task_events` | Human took over via VNC |
| Switch count per session | aggregated | query | `COUNT WHERE event_type = 'engine_switch' GROUP BY workflow_run_id` |
| Failure rate per engine | aggregated | query | `failures / total_operations GROUP BY engine` |
| Avg switch latency | aggregated | query | `AVG(duration_ms) WHERE event_type = 'engine_switch'` |

### Event Logger Integration

```typescript
// In SandboxController, after a successful switch:
await eventLogger.log(taskId, "engine_switch", {
  from: event.from,
  to: event.to,
  reason: event.reason,
  durationMs: event.durationMs,
  pageUrl: event.pageState.url,
  success: event.success,
});

// In the fallback executor, after each operation:
await eventLogger.log(taskId, "engine_operation", {
  engine: handle.type,
  operation: "act",
  durationMs: Date.now() - opStart,
  success: true,
  platform: detectedPlatform,
});
```

### Dashboard Queries

```sql
-- Engine switch frequency per workflow run
SELECT
  workflow_run_id,
  COUNT(*) AS switch_count,
  ARRAY_AGG(data->>'reason' ORDER BY created_at) AS reasons
FROM task_events
WHERE event_type = 'engine_switch'
GROUP BY workflow_run_id
ORDER BY switch_count DESC;

-- Average switch latency
SELECT
  (data->>'from')::text AS from_engine,
  (data->>'to')::text AS to_engine,
  ROUND(AVG((data->>'durationMs')::numeric)) AS avg_latency_ms,
  COUNT(*) AS total_switches
FROM task_events
WHERE event_type = 'engine_switch'
GROUP BY data->>'from', data->>'to';

-- Engine success rates by platform
SELECT
  data->>'platform' AS platform,
  data->>'engine' AS engine,
  COUNT(*) FILTER (WHERE (data->>'success')::boolean = true) AS successes,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE (data->>'success')::boolean = true)::numeric /
    NULLIF(COUNT(*), 0), 3
  ) AS success_rate
FROM task_events
WHERE event_type = 'engine_operation'
GROUP BY data->>'platform', data->>'engine'
ORDER BY platform, success_rate DESC;
```

---

## 11. Testing Strategy

### Unit Tests

#### Mock CDP Server

```typescript
// tests/unit/sandbox-controller.test.ts

import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Minimal mock CDP server that responds to /json/version and /json/list
 * and accepts WebSocket connections.
 */
function createMockCdpServer(port: number): { server: Server; wss: WebSocketServer } {
  const server = createServer((req, res) => {
    if (req.url === "/json/version") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        "Browser": "HeadlessChrome/120.0",
        "Protocol-Version": "1.3",
        "WebKit-Version": "537.36",
      }));
    } else if (req.url === "/json/list") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([{
        type: "page",
        url: "https://jobs.example.com/apply",
        title: "Apply Now",
        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/1`,
      }]));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const wss = new WebSocketServer({ server });
  server.listen(port);

  return { server, wss };
}
```

#### Test: Engine Connection

```typescript
describe("SandboxController", () => {
  let cdpServer: ReturnType<typeof createMockCdpServer>;

  beforeEach(() => {
    cdpServer = createMockCdpServer(19222);
  });

  afterEach(() => {
    cdpServer.server.close();
  });

  it("connects stagehand to CDP URL", async () => {
    // Mock the AdsPower API response
    const mockAdsPower = createMockAdsPowerServer(50325, {
      cdpUrl: "ws://127.0.0.1:19222/devtools/browser/abc",
      port: 19222,
    });

    const controller = new SandboxController({
      adsPowerBaseUrl: "http://127.0.0.1:50325",
      profileId: "test-profile",
      engines: {
        stagehand: { maxFailures: 3, operationTimeoutMs: 15000, confidenceThreshold: 0.6, retryCount: 2 },
        magnitude: { maxFailures: 3, operationTimeoutMs: 30000, confidenceThreshold: 0.5, retryCount: 2 },
      },
      stagehandModel: "anthropic/claude-sonnet-4-5-20250514",
      enableVnc: false,
    });

    await controller.startProfile();
    expect(controller.getCdpUrl()).toContain("ws://");
    expect(controller.getCurrentEngine()).toBe("none");

    // Note: actual Stagehand.init() requires a real browser.
    // In unit tests, mock the Stagehand constructor.

    mockAdsPower.close();
  });
});
```

#### Test: Engine Switching

```typescript
it("switches from stagehand to magnitude on failure threshold", async () => {
  const controller = createTestController(); // helper that mocks everything

  // Simulate connecting stagehand
  await controller.startProfile();
  await controller.connectStagehand();
  expect(controller.getCurrentEngine()).toBe("stagehand");

  // Record failures until threshold
  controller.recordFailure();
  controller.recordFailure();
  controller.recordFailure();
  expect(controller.shouldSwitch()).toBe(true);

  // Execute switch
  await controller.switchEngine("magnitude", "3 consecutive failures");
  expect(controller.getCurrentEngine()).toBe("magnitude");

  // Verify switch history
  const history = controller.getSwitchHistory();
  expect(history).toHaveLength(1);
  expect(history[0]!.from).toBe("stagehand");
  expect(history[0]!.to).toBe("magnitude");
  expect(history[0]!.success).toBe(true);
});
```

#### Test: Concurrent Access Prevention

```typescript
it("prevents concurrent engine connections via mutex", async () => {
  const controller = createTestController();
  await controller.startProfile();

  // Start two connections simultaneously
  const p1 = controller.connectStagehand();
  const p2 = controller.connectMagnitude();

  // Both should resolve (mutex serializes them)
  // but only the last one should be active
  await Promise.all([p1, p2]);

  // Magnitude was connected second, so it should be active
  expect(controller.getCurrentEngine()).toBe("magnitude");
});
```

#### Test: Browser Death During Switch

```typescript
it("throws unrecoverable error when browser dies during switch", async () => {
  const controller = createTestController();
  await controller.startProfile();
  await controller.connectStagehand();

  // Kill the mock CDP server to simulate browser death
  cdpServer.server.close();

  await expect(
    controller.switchEngine("magnitude", "testing browser death"),
  ).rejects.toThrow("Browser died during engine switch");
});
```

### Integration Tests

Integration tests require a running AdsPower instance and real browser. These run in CI with a Docker-based AdsPower setup.

```typescript
// tests/integration/sandbox-controller.integration.test.ts

describe("SandboxController integration", () => {
  it("full lifecycle: start -> connect stagehand -> navigate -> switch -> stop", async () => {
    const controller = new SandboxController({
      adsPowerBaseUrl: process.env.ADSPOWER_API_URL!,
      profileId: process.env.TEST_PROFILE_ID!,
      engines: {
        stagehand: { maxFailures: 3, operationTimeoutMs: 15000, confidenceThreshold: 0.6, retryCount: 2 },
        magnitude: { maxFailures: 3, operationTimeoutMs: 30000, confidenceThreshold: 0.5, retryCount: 2 },
      },
      stagehandModel: "anthropic/claude-sonnet-4-5-20250514",
      enableVnc: false,
    });

    // Start
    const session = await controller.startProfile();
    expect(session.cdpUrl).toBeTruthy();

    // Connect Stagehand
    const stagehand = await controller.connectStagehand();
    await stagehand.page.goto("https://example.com");
    const title = await stagehand.page.title();
    expect(title).toContain("Example");

    // Switch to Magnitude
    await controller.switchEngine("magnitude", "integration test");
    const magnitude = controller.getMagnitude()!;
    const pageUrl = magnitude.page.url();
    expect(pageUrl).toContain("example.com"); // state preserved

    // Cleanup
    await controller.stopAll();
    expect(controller.getCurrentEngine()).toBe("none");
  }, 60_000);
});
```

### Test Matrix

| Test Category | Mocked | Real Browser | CI |
|---------------|--------|-------------|-----|
| Unit: connection lifecycle | AdsPower API, Stagehand, Magnitude | No | Yes |
| Unit: mutex behavior | Everything | No | Yes |
| Unit: failure tracking & thresholds | Everything | No | Yes |
| Unit: cascade executor | Engines, but real timeout logic | No | Yes |
| Integration: full lifecycle | Nothing | Yes (AdsPower) | Docker-based |
| Integration: engine switch | Nothing | Yes | Docker-based |
| Integration: VNC enable/disable | Nothing | Yes | Docker-based |
| E2E: apply to test job | Nothing | Yes | Nightly |

---

## Appendix A: Default SandboxConfig

```typescript
const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  adsPowerBaseUrl: "http://127.0.0.1:50325",
  profileId: "default",
  engines: {
    stagehand: {
      maxFailures: 3,
      operationTimeoutMs: 15_000,
      confidenceThreshold: 0.6,
      retryCount: 2,
    },
    magnitude: {
      maxFailures: 3,
      operationTimeoutMs: 30_000,
      confidenceThreshold: 0.5,
      retryCount: 2,
    },
  },
  stagehandModel: "anthropic/claude-sonnet-4-5-20250514",
  magnitudeModel: undefined, // uses Magnitude default
  enableVnc: true,
};
```

## Appendix B: File Inventory

| File | Purpose |
|------|---------|
| `apps/worker/src/services/sandbox-controller.ts` | Main SandboxController class |
| `apps/worker/src/services/sandbox-controller.types.ts` | All types and interfaces |
| `apps/worker/src/services/fallback-cascade.ts` | `executeWithFallback()` and cascade config |
| `apps/worker/src/services/engine-selection.ts` | `selectEngine()` platform-to-engine mapping |
| `tests/unit/sandbox-controller.test.ts` | Unit tests with mock CDP |
| `tests/integration/sandbox-controller.integration.test.ts` | Integration tests with real browser |

## Appendix C: Open Questions

1. **Stagehand CUA mode**: Stagehand v3 supports a `computer-use` agent mode. The exact API for switching between DOM mode and CUA mode within the same Stagehand instance needs verification. It may require a re-init with different options rather than a runtime toggle.

2. **Magnitude session reuse**: When connecting Magnitude to an already-loaded page (via CDP), does Magnitude re-navigate to a blank page or does it inherit the current page? TestingBot's integration suggests it connects to the existing state, but this needs a spike test.

3. **AdsPower profile pool**: For high-throughput scenarios, the SandboxController should be extended to support a pool of pre-warmed AdsPower profiles. This is out of scope for the initial implementation.

4. **Playwright version conflicts**: Both Stagehand and Magnitude depend on Playwright. If they pin different major versions, only one can be installed. Verify version compatibility before adding both as dependencies.
