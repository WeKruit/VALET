/**
 * AgentBrowser - unified interface that Brain (Team 3) consumes.
 *
 * Combines:
 *   - HumanizedPage for human-like low-level actions
 *   - StagehandEngine for DOM-based AI actions
 *   - MagnitudeEngine for vision-based AI actions
 *
 * Provides action tracing for the self-learning feedback loop:
 * every AI-driven action records an ActionTrace that can be
 * converted into an ActionManual step.
 */

import type { Page } from "playwright";

import { HumanizedPage } from "./humanized-page.js";
import { StagehandEngine } from "./stagehand-engine.js";
import type { StagehandEngineOptions } from "./stagehand-engine.js";
import { MagnitudeEngine } from "./magnitude-engine.js";
import type { MagnitudeEngineOptions } from "./magnitude-engine.js";

import type {
  EngineActionResult,
  ObservedElement,
  IAgentBrowser,
} from "@valet/shared/types";

// ---------------------------------------------------------------------------
// Action trace types for the learning loop
// ---------------------------------------------------------------------------

export interface ActionStep {
  action: "click" | "type" | "select" | "scroll" | "navigate" | "upload";
  selector?: string;
  value?: string;
  description: string;
  timestamp: string;
}

export interface ActionTrace {
  steps: ActionStep[];
  success: boolean;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Construction options
// ---------------------------------------------------------------------------

export interface AgentBrowserOptions {
  enableStagehand?: boolean;
  enableMagnitude?: boolean;
  cdpUrl?: string;
  stagehand?: StagehandEngineOptions;
  magnitude?: MagnitudeEngineOptions;
}

// ---------------------------------------------------------------------------
// AgentBrowser
// ---------------------------------------------------------------------------

export class AgentBrowser implements IAgentBrowser {
  private readonly humanizedPage: HumanizedPage;
  private stagehandEngine: StagehandEngine | null = null;
  private magnitudeEngine: MagnitudeEngine | null = null;
  private readonly page: Page;
  private readonly cdpUrl: string | null;

  constructor(page: Page, options?: AgentBrowserOptions) {
    this.page = page;
    this.humanizedPage = new HumanizedPage(page);
    this.cdpUrl = options?.cdpUrl ?? null;

    if (options?.enableStagehand) {
      this.stagehandEngine = new StagehandEngine(options.stagehand);
    }

    if (options?.enableMagnitude) {
      this.magnitudeEngine = new MagnitudeEngine(options.magnitude);
    }
  }

  /**
   * Initialize engines that require async setup.
   * Must be called after construction if engines are enabled.
   */
  async init(): Promise<void> {
    if (!this.cdpUrl) return;

    const tasks: Promise<void>[] = [];

    if (this.stagehandEngine) {
      tasks.push(this.stagehandEngine.connect(this.cdpUrl));
    }

    if (this.magnitudeEngine) {
      tasks.push(this.magnitudeEngine.connect(this.cdpUrl));
    }

    // Connect engines sequentially - CDP mutex means only one at a time
    for (const task of tasks) {
      await task;
    }
  }

  // -----------------------------------------------------------------------
  // IAgentBrowser: Humanized low-level actions
  // -----------------------------------------------------------------------

  async humanClick(selector: string): Promise<void> {
    await this.humanizedPage.humanClick(selector);
  }

  async humanType(selector: string, text: string): Promise<void> {
    await this.humanizedPage.humanType(selector, text);
  }

  async humanScroll(deltaY: number): Promise<void> {
    await this.humanizedPage.humanScroll(deltaY);
  }

  // -----------------------------------------------------------------------
  // IAgentBrowser: AI-driven actions (return action results for learning loop)
  // -----------------------------------------------------------------------

  async stagehandAct(instruction: string): Promise<EngineActionResult> {
    if (!this.stagehandEngine) {
      throw new Error(
        "Stagehand engine is not enabled. Pass enableStagehand: true in options.",
      );
    }

    if (!this.stagehandEngine.isConnected()) {
      throw new Error(
        "Stagehand engine is not connected. Call init() first.",
      );
    }

    return this.stagehandEngine.act(instruction);
  }

  async magnitudeAct(instruction: string): Promise<EngineActionResult> {
    if (!this.magnitudeEngine) {
      throw new Error(
        "Magnitude engine is not enabled. Pass enableMagnitude: true in options.",
      );
    }

    if (!this.magnitudeEngine.isConnected()) {
      throw new Error(
        "Magnitude engine is not connected. Call init() first.",
      );
    }

    return this.magnitudeEngine.act(instruction);
  }

  // -----------------------------------------------------------------------
  // IAgentBrowser: Observation
  // -----------------------------------------------------------------------

  async observe(instruction: string): Promise<ObservedElement[]> {
    // Prefer Stagehand for observation (DOM-based is more precise)
    if (this.stagehandEngine?.isConnected()) {
      return this.stagehandEngine.observe(instruction);
    }

    // Fall back to Magnitude
    if (this.magnitudeEngine?.isConnected()) {
      return this.magnitudeEngine.observe(instruction);
    }

    throw new Error("No engine is connected for observation.");
  }

  // -----------------------------------------------------------------------
  // IAgentBrowser: Raw access
  // -----------------------------------------------------------------------

  rawPage(): Page {
    return this.page;
  }

  // -----------------------------------------------------------------------
  // IAgentBrowser: Cleanup
  // -----------------------------------------------------------------------

  async close(): Promise<void> {
    const tasks: Promise<void>[] = [];

    if (this.stagehandEngine?.isConnected()) {
      tasks.push(this.stagehandEngine.disconnect());
    }

    if (this.magnitudeEngine?.isConnected()) {
      tasks.push(this.magnitudeEngine.disconnect());
    }

    await Promise.allSettled(tasks);
  }
}
