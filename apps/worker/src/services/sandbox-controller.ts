/**
 * SandboxController - manages browser engine lifecycle, CDP mutex, engine switching.
 *
 * Invariant: at most one engine is connected to the CDP endpoint at any time.
 * One controller is created per workflow run and shared via closure across
 * Hatchet tasks.
 */

import { Mutex } from "async-mutex";
import pino from "pino";
import type {
  ISandboxController,
  ISandboxProvider,
  IBrowserEngine,
  EngineType,
  EngineHandle,
  EngineSwitchEvent,
  SandboxControllerConfig,
  ProvisionOptions,
  ProvisionResult,
  PageState,
} from "@valet/shared/types";
import type { BrowserSession } from "@valet/shared/types";
import { createEngine } from "../engines/index.js";

const logger = pino({ name: "sandbox-controller" });

export class SandboxController implements ISandboxController {
  private readonly config: SandboxControllerConfig;
  private readonly provider: ISandboxProvider;
  private readonly provisionOptions: ProvisionOptions;
  private readonly cdpMutex = new Mutex();

  private provisionResult: ProvisionResult | null = null;
  private currentHandle: EngineHandle | null = null;
  private switchHistory: EngineSwitchEvent[] = [];
  private destroyed = false;

  constructor(
    config: SandboxControllerConfig,
    provider: ISandboxProvider,
    provisionOptions: ProvisionOptions,
  ) {
    this.config = config;
    this.provider = provider;
    this.provisionOptions = provisionOptions;
  }

  // ---------------------------------------------------------------------------
  // Session Lifecycle
  // ---------------------------------------------------------------------------

  async startSession(): Promise<BrowserSession> {
    if (this.destroyed) {
      throw new Error("SandboxController has been destroyed");
    }

    logger.info(
      { provider: this.config.providerType, taskId: this.provisionOptions.taskId },
      "Starting sandbox session",
    );

    this.provisionResult = await this.provider.provision(this.provisionOptions);

    logger.info(
      {
        cdpUrl: this.provisionResult.cdpUrl,
        tier: this.provisionResult.tier,
        interventionUrl: this.provisionResult.interventionUrl,
      },
      "Sandbox session started",
    );

    return this.provisionResult.session;
  }

  async stopSession(): Promise<void> {
    if (this.provisionResult) {
      await this.disconnectEngine();
      await this.provider.release(this.provisionResult);
      this.provisionResult = null;
      logger.info("Sandbox session stopped");
    }
  }

  // ---------------------------------------------------------------------------
  // Engine Management
  // ---------------------------------------------------------------------------

  async connectEngine(engineType: EngineType): Promise<IBrowserEngine> {
    if (this.destroyed) {
      throw new Error("SandboxController has been destroyed");
    }
    if (!this.provisionResult) {
      throw new Error("No active session. Call startSession() first.");
    }

    const release = await this.cdpMutex.acquire();
    try {
      // Disconnect any existing engine first
      if (this.currentHandle?.engine) {
        logger.info(
          { current: this.currentHandle.type },
          "Disconnecting existing engine before connecting new one",
        );
        await this.currentHandle.engine.disconnect();
      }

      const engine = createEngine(engineType);
      await engine.connect(this.provisionResult.cdpUrl);

      this.currentHandle = {
        type: engineType,
        engine,
        connectedAt: new Date().toISOString(),
        failureCount: 0,
      };

      logger.info({ engineType }, "Engine connected");
      return engine;
    } catch (err) {
      release();
      throw err;
    }
  }

  async disconnectEngine(): Promise<void> {
    if (!this.currentHandle?.engine) return;

    try {
      await this.currentHandle.engine.disconnect();
      logger.info({ engine: this.currentHandle.type }, "Engine disconnected");
    } catch (err) {
      logger.warn(
        { engine: this.currentHandle.type, error: String(err) },
        "Error disconnecting engine (non-fatal)",
      );
    } finally {
      this.currentHandle = null;
      // Release the mutex if held
      if (this.cdpMutex.isLocked()) {
        this.cdpMutex.release();
      }
    }
  }

  async switchEngine(
    targetEngine: EngineType,
    reason: string,
  ): Promise<EngineHandle> {
    if (this.destroyed) {
      throw new Error("SandboxController has been destroyed");
    }
    if (!this.provisionResult) {
      throw new Error("No active session. Call startSession() first.");
    }

    const startTime = Date.now();
    const fromEngine = this.currentHandle?.type ?? "none";
    let pageState: PageState = {
      url: "",
      title: "",
      scrollX: 0,
      scrollY: 0,
      capturedAt: new Date().toISOString(),
    };

    logger.info({ from: fromEngine, to: targetEngine, reason }, "Switching engine");

    try {
      // Step 1: Capture page state from the current engine
      if (this.currentHandle?.engine?.isConnected()) {
        try {
          pageState = await this.currentHandle.engine.getPageState();
        } catch (err) {
          logger.warn(
            { error: String(err) },
            "Failed to capture page state during switch (continuing anyway)",
          );
        }
      }

      // Step 2: Disconnect old engine
      await this.disconnectEngine();

      // Step 3: Connect new engine
      const newEngine = await this.connectEngine(targetEngine);

      // Step 4: Restore page state (navigate to the same URL)
      if (pageState.url) {
        try {
          await newEngine.navigate(pageState.url);
        } catch (err) {
          logger.warn(
            { url: pageState.url, error: String(err) },
            "Failed to restore page state after switch",
          );
        }
      }

      const switchEvent: EngineSwitchEvent = {
        from: fromEngine,
        to: targetEngine,
        reason,
        pageState,
        durationMs: Date.now() - startTime,
        success: true,
        timestamp: new Date().toISOString(),
      };
      this.switchHistory.push(switchEvent);

      logger.info(
        { from: fromEngine, to: targetEngine, durationMs: switchEvent.durationMs },
        "Engine switch completed",
      );

      return this.currentHandle!;
    } catch (err) {
      const switchEvent: EngineSwitchEvent = {
        from: fromEngine,
        to: targetEngine,
        reason,
        pageState,
        durationMs: Date.now() - startTime,
        success: false,
        timestamp: new Date().toISOString(),
      };
      this.switchHistory.push(switchEvent);

      logger.error(
        { from: fromEngine, to: targetEngine, error: String(err) },
        "Engine switch failed",
      );
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // State Accessors
  // ---------------------------------------------------------------------------

  getCurrentEngine(): EngineType {
    return this.currentHandle?.type ?? "none";
  }

  getEngineHandle(): EngineHandle | null {
    return this.currentHandle;
  }

  getCdpUrl(): string | null {
    return this.provisionResult?.cdpUrl ?? null;
  }

  getSession(): BrowserSession | null {
    return this.provisionResult?.session ?? null;
  }

  getSwitchHistory(): EngineSwitchEvent[] {
    return [...this.switchHistory];
  }

  // ---------------------------------------------------------------------------
  // Failure Tracking
  // ---------------------------------------------------------------------------

  recordFailure(): number {
    if (!this.currentHandle) return 0;

    this.currentHandle.failureCount++;
    logger.warn(
      { engine: this.currentHandle.type, failureCount: this.currentHandle.failureCount },
      "Engine failure recorded",
    );
    return this.currentHandle.failureCount;
  }

  shouldSwitch(): boolean {
    if (!this.currentHandle) return false;

    const engineType = this.currentHandle.type;
    if (engineType === "none") return false;

    const engineConfig = engineType === "stagehand"
      ? this.config.engines.stagehand
      : this.config.engines.magnitude;

    return this.currentHandle.failureCount >= engineConfig.maxFailures;
  }

  // ---------------------------------------------------------------------------
  // VNC / Human Intervention
  // ---------------------------------------------------------------------------

  getInterventionUrl(): string | null {
    if (!this.config.enableHumanIntervention) return null;
    return this.provisionResult?.interventionUrl ?? null;
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    logger.info("Destroying SandboxController");

    try {
      await this.disconnectEngine();
    } catch (err) {
      logger.warn({ error: String(err) }, "Error during engine disconnect in destroy");
    }

    try {
      if (this.provisionResult) {
        await this.provider.release(this.provisionResult);
        this.provisionResult = null;
      }
    } catch (err) {
      logger.warn({ error: String(err) }, "Error during provider release in destroy");
    }

    logger.info("SandboxController destroyed");
  }
}
