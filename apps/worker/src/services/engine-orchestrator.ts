/**
 * EngineOrchestrator - decides which engine to use and handles the
 * fallback cascade: Stagehand DOM -> Stagehand CUA -> Magnitude -> Human.
 *
 * Wraps ISandboxController and adds decision/retry logic.
 */

import pino from "pino";
import type {
  IEngineOrchestrator,
  ISandboxController,
  IBrowserEngine,
  EngineType,
  EngineSelection,
  SwitchDecision,
  FallbackCascadeConfig,
  InterventionReason,
  FailureSignal,
} from "@valet/shared/types";
import type { Platform } from "@valet/shared/types";
import { classifyFailure } from "./failure-classifier.js";

const logger = pino({ name: "engine-orchestrator" });

/** Default cascade: Stagehand DOM -> Stagehand CUA -> Magnitude -> Human */
const DEFAULT_CASCADE: FallbackCascadeConfig = {
  totalTimeoutMs: 5 * 60 * 1000, // 5 minutes
  levels: [
    {
      engine: "stagehand",
      mode: "dom",
      retryCount: 2,
      timeoutPerAttemptMs: 30_000,
    },
    {
      engine: "stagehand",
      mode: "cua",
      retryCount: 1,
      timeoutPerAttemptMs: 45_000,
    },
    {
      engine: "magnitude",
      retryCount: 1,
      timeoutPerAttemptMs: 60_000,
      skipForPlatforms: [],
    },
  ],
};

/** Workday benefits from vision-first approach */
const WORKDAY_CASCADE: FallbackCascadeConfig = {
  totalTimeoutMs: 5 * 60 * 1000,
  levels: [
    {
      engine: "magnitude",
      retryCount: 2,
      timeoutPerAttemptMs: 60_000,
    },
    {
      engine: "stagehand",
      mode: "cua",
      retryCount: 1,
      timeoutPerAttemptMs: 45_000,
    },
    {
      engine: "stagehand",
      mode: "dom",
      retryCount: 1,
      timeoutPerAttemptMs: 30_000,
    },
  ],
};

export class EngineOrchestrator implements IEngineOrchestrator {
  private controller: ISandboxController;
  private lastFailureSignal: FailureSignal | null = null;
  private humanTakeoverRequested = false;

  constructor(controller: ISandboxController) {
    this.controller = controller;
  }

  // ---------------------------------------------------------------------------
  // Engine Selection
  // ---------------------------------------------------------------------------

  selectEngine(platform: Platform): EngineSelection {
    // Workday uses custom elements and shadow DOM heavily - vision-first is better
    if (platform === "workday") {
      return {
        primary: "magnitude",
        cascade: WORKDAY_CASCADE,
      };
    }

    // Default: Stagehand DOM-first for most platforms
    return {
      primary: "stagehand",
      primaryMode: "dom",
      cascade: DEFAULT_CASCADE,
    };
  }

  // ---------------------------------------------------------------------------
  // Switch Evaluation
  // ---------------------------------------------------------------------------

  evaluateSwitch(
    error: Error | null,
    operationDurationMs: number,
    confidenceScore?: number,
  ): SwitchDecision {
    const currentEngine = this.controller.getCurrentEngine();

    // If no engine is active, recommend stagehand
    if (currentEngine === "none") {
      return {
        shouldSwitch: true,
        reason: "No engine currently active",
        targetEngine: "stagehand",
      };
    }

    // Classify the failure if there was an error
    if (error) {
      const signal = classifyFailure(error, currentEngine, operationDurationMs);
      this.lastFailureSignal = signal;

      // Record the failure in the controller
      this.controller.recordFailure();

      // If the failure suggests a vision engine and we're on stagehand, switch
      if (signal.suggestsVisionEngine && currentEngine === "stagehand") {
        return {
          shouldSwitch: true,
          reason: `Failure type '${signal.type}' suggests vision engine`,
          targetEngine: "magnitude",
        };
      }

      // If not retriable with the same engine, switch
      if (!signal.retriableWithSameEngine) {
        const target = currentEngine === "stagehand" ? "magnitude" : "stagehand";
        return {
          shouldSwitch: true,
          reason: `Non-retriable failure: ${signal.type}`,
          targetEngine: target,
        };
      }
    }

    // If confidence is too low, consider switching
    if (confidenceScore !== undefined && confidenceScore < 0.3) {
      const target = currentEngine === "stagehand" ? "magnitude" : "stagehand";
      return {
        shouldSwitch: true,
        reason: `Low confidence score: ${confidenceScore}`,
        targetEngine: target,
      };
    }

    // Check if controller's failure threshold has been exceeded
    if (this.controller.shouldSwitch()) {
      const target = currentEngine === "stagehand" ? "magnitude" : "stagehand";
      return {
        shouldSwitch: true,
        reason: "Failure threshold exceeded for current engine",
        targetEngine: target,
      };
    }

    return {
      shouldSwitch: false,
      reason: "No switch needed",
      targetEngine: currentEngine,
    };
  }

  // ---------------------------------------------------------------------------
  // Fallback Cascade Execution
  // ---------------------------------------------------------------------------

  async executeWithFallback<T>(
    operation: (engine: IBrowserEngine) => Promise<T>,
    context: { taskId: string; step: string },
  ): Promise<T> {
    const selection = this.selectEngine("unknown");
    const cascade = selection.cascade;
    const cascadeStart = Date.now();

    for (let levelIndex = 0; levelIndex < cascade.levels.length; levelIndex++) {
      const level = cascade.levels[levelIndex]!;

      // Check total timeout
      if (Date.now() - cascadeStart > cascade.totalTimeoutMs) {
        logger.error(
          { taskId: context.taskId, step: context.step },
          "Cascade total timeout exceeded",
        );
        break;
      }

      // Connect the engine for this level
      try {
        await this.controller.connectEngine(level.engine);
      } catch (err) {
        logger.warn(
          { engine: level.engine, error: String(err) },
          "Failed to connect engine at cascade level, trying next",
        );
        continue;
      }

      // Retry loop within this level
      for (let attempt = 0; attempt <= level.retryCount; attempt++) {
        try {
          const engine = this.controller.getEngineHandle()?.engine;
          if (!engine) {
            throw new Error("No engine available after connection");
          }

          const result = await withTimeout(
            operation(engine),
            level.timeoutPerAttemptMs,
          );

          logger.info(
            {
              taskId: context.taskId,
              step: context.step,
              engine: level.engine,
              levelIndex,
              attempt,
            },
            "Operation succeeded",
          );

          return result;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.warn(
            {
              taskId: context.taskId,
              step: context.step,
              engine: level.engine,
              levelIndex,
              attempt,
              error: error.message,
            },
            "Operation failed",
          );

          // On last attempt at this level, move to next level
          if (attempt >= level.retryCount) {
            break;
          }
        }
      }
    }

    // All cascade levels exhausted - request human takeover
    logger.error(
      { taskId: context.taskId, step: context.step },
      "All cascade levels exhausted, requesting human takeover",
    );

    await this.requestHumanTakeover("engine_exhausted");

    throw new Error(
      `All engines exhausted for step '${context.step}' in task '${context.taskId}'`,
    );
  }

  // ---------------------------------------------------------------------------
  // Human Takeover
  // ---------------------------------------------------------------------------

  async requestHumanTakeover(
    reason: InterventionReason,
    _screenshotUrl?: string,
  ): Promise<void> {
    if (this.humanTakeoverRequested) {
      logger.info("Human takeover already requested, skipping duplicate");
      return;
    }

    this.humanTakeoverRequested = true;

    logger.info(
      { reason, interventionUrl: this.controller.getInterventionUrl() },
      "Requesting human takeover",
    );

    // TODO: Publish intervention request via Redis pub/sub
    // This will be wired up when the IHumanInterventionHandler is implemented
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  getCurrentEngine(): EngineType {
    return this.controller.getCurrentEngine();
  }
}

/**
 * Run a promise with a timeout. Rejects with a timeout error if the
 * operation does not complete within the specified duration.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
