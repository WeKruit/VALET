import pino from "pino";
import type { ManualManager, ManualWithSteps, ActionTrace, ActionTraceStep } from "./manual-manager.js";
import type { EventLogger } from "./event-logger.js";

const logger = pino({ name: "execution-engine" });

/** Minimal browser interface. Will be replaced by the real AgentBrowser. */
export interface IAgentBrowser {
  humanClick(selector: string): Promise<void>;
  humanType(selector: string, value: string): Promise<void>;
  selectOption(selector: string, value: string): Promise<void>;
  uploadFile(selector: string, filePath: string): Promise<void>;
  navigate(url: string): Promise<void>;
  scroll(direction: "up" | "down", amount?: number): Promise<void>;
  waitForSelector(selector: string, timeoutMs?: number): Promise<boolean>;
  /** AI-driven exploration action (Stagehand act). */
  stagehandAct(instruction: string): Promise<StagehandActResult>;
  getCurrentUrl(): Promise<string>;
}

export interface StagehandActResult {
  success: boolean;
  action: string;
  selector: string | null;
  description: string;
}

export interface TaskInput {
  url: string;
  platform: string;
  userData: Record<string, string>;
  qaAnswers: Record<string, string>;
}

export interface ExecutionResult {
  success: boolean;
  mode: "reuse" | "explore";
  trace?: ActionTrace;
  manualId?: string;
  stepsCompleted: number;
  totalSteps: number;
  durationMs: number;
}

export class ExecutionEngine {
  constructor(
    private manualManager: ManualManager,
    private eventLogger: EventLogger,
  ) {}

  /** Execute a task using Reuse mode (if manual found) or Explore mode. */
  async execute(task: TaskInput, agentBrowser: IAgentBrowser): Promise<ExecutionResult> {
    const startTime = Date.now();

    const manual = await this.manualManager.findManual(task.url, task.platform);

    if (manual) {
      logger.info(
        { manualId: manual.id, manualName: manual.name, healthScore: manual.healthScore },
        "Found existing manual, using Reuse mode",
      );
      const manualWithSteps = await this.manualManager.getManualWithSteps(manual.id);
      return this.executeReuse(manualWithSteps, task, agentBrowser, startTime);
    }

    logger.info(
      { url: task.url, platform: task.platform },
      "No manual found, using Explore mode",
    );
    return this.executeExplore(task, agentBrowser, startTime);
  }

  /** Execute using a known manual (replay recorded steps). */
  private async executeReuse(
    manualWithSteps: ManualWithSteps,
    task: TaskInput,
    browser: IAgentBrowser,
    startTime: number,
  ): Promise<ExecutionResult> {
    const { manual, steps } = manualWithSteps;
    let stepsCompleted = 0;

    for (const step of steps) {
      try {
        const resolvedValue = this.resolveValue(step.value, task);
        await this.executeStep(browser, step.action, step.selector, step.fallbackSelector, resolvedValue);
        stepsCompleted++;

        if (step.waitAfterMs && step.waitAfterMs > 0) {
          await sleep(step.waitAfterMs);
        }
      } catch (err) {
        logger.warn(
          { manualId: manual.id, stepOrder: step.stepOrder, error: String(err) },
          "Reuse step failed, falling back to Explore for remaining steps",
        );

        // Fall back to Explore mode for remaining steps
        const exploreResult = await this.executeExplore(task, browser, startTime);

        // Update the manual health (partial failure)
        await this.manualManager.updateHealthScore(manual.id, false);

        return {
          ...exploreResult,
          mode: "reuse", // Started as reuse even though we fell back
          manualId: manual.id,
          stepsCompleted: stepsCompleted + exploreResult.stepsCompleted,
          totalSteps: steps.length,
        };
      }
    }

    // All steps completed successfully
    await this.manualManager.updateHealthScore(manual.id, true);

    return {
      success: true,
      mode: "reuse",
      manualId: manual.id,
      stepsCompleted,
      totalSteps: steps.length,
      durationMs: Date.now() - startTime,
    };
  }

  /** Execute using AI-driven exploration (Stagehand). */
  private async executeExplore(
    task: TaskInput,
    browser: IAgentBrowser,
    startTime: number,
  ): Promise<ExecutionResult> {
    const traceSteps: ActionTraceStep[] = [];
    let stepsCompleted = 0;
    let success = false;

    try {
      // Navigate to the target URL
      await browser.navigate(task.url);
      traceSteps.push({
        action: "navigate",
        selector: null,
        value: task.url,
        description: `Navigate to ${task.url}`,
      });
      stepsCompleted++;

      // Use Stagehand for AI-driven form filling
      // Build an instruction from the user data
      const fieldInstructions = Object.entries(task.userData)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");

      const qaInstructions = Object.entries(task.qaAnswers)
        .map(([question, answer]) => `Q: ${question} A: ${answer}`)
        .join("; ");

      const instruction = `Fill out the job application form with: ${fieldInstructions}. ${qaInstructions ? `Answer questions: ${qaInstructions}` : ""}`;

      // TODO: In production, this would be a multi-step loop with Stagehand
      // performing individual actions. For now, we represent it as a single act.
      const result = await browser.stagehandAct(instruction);

      traceSteps.push({
        action: result.action,
        selector: result.selector,
        description: result.description,
      });
      stepsCompleted++;
      success = result.success;
    } catch (err) {
      logger.error(
        { url: task.url, error: String(err) },
        "Explore mode failed",
      );
      success = false;
    }

    const trace: ActionTrace = {
      steps: traceSteps,
      url: task.url,
      platform: task.platform,
      success,
      durationMs: Date.now() - startTime,
    };

    // If successful, create a manual from the trace for future reuse
    let manualId: string | undefined;
    if (success && traceSteps.length > 0) {
      try {
        manualId = await this.manualManager.createManualFromTrace(trace, task.url, task.platform);
        logger.info({ manualId }, "Created new manual from explore trace");
      } catch (err) {
        logger.error({ error: String(err) }, "Failed to create manual from trace");
      }
    }

    return {
      success,
      mode: "explore",
      trace,
      manualId,
      stepsCompleted,
      totalSteps: stepsCompleted,
      durationMs: Date.now() - startTime,
    };
  }

  /** Execute a single step on the browser. */
  private async executeStep(
    browser: IAgentBrowser,
    action: string,
    selector: string | null,
    fallbackSelector: string | null,
    value: string | null,
  ): Promise<void> {
    const resolvedSelector = await this.resolveSelector(browser, selector, fallbackSelector);

    switch (action) {
      case "click":
        await browser.humanClick(resolvedSelector);
        break;
      case "type":
        if (!value) throw new Error("Type action requires a value");
        await browser.humanType(resolvedSelector, value);
        break;
      case "select":
        if (!value) throw new Error("Select action requires a value");
        await browser.selectOption(resolvedSelector, value);
        break;
      case "upload":
        if (!value) throw new Error("Upload action requires a file path");
        await browser.uploadFile(resolvedSelector, value);
        break;
      case "navigate":
        if (!value) throw new Error("Navigate action requires a URL");
        await browser.navigate(value);
        break;
      case "scroll":
        await browser.scroll(value === "up" ? "up" : "down");
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Try the primary selector; if it's not found, try the fallback.
   * Throws if neither is found.
   */
  private async resolveSelector(
    browser: IAgentBrowser,
    selector: string | null,
    fallbackSelector: string | null,
  ): Promise<string> {
    if (!selector && !fallbackSelector) {
      throw new Error("No selector available for this step");
    }

    if (selector) {
      const found = await browser.waitForSelector(selector, 3000);
      if (found) return selector;
    }

    if (fallbackSelector) {
      const found = await browser.waitForSelector(fallbackSelector, 3000);
      if (found) return fallbackSelector;
    }

    throw new Error(
      `Neither selector found: primary=${selector}, fallback=${fallbackSelector}`,
    );
  }

  /**
   * Resolve template placeholders in step values.
   * e.g., "{{firstName}}" -> task.userData.firstName
   */
  private resolveValue(value: string | null, task: TaskInput): string | null {
    if (!value) return null;

    return value.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      return task.userData[key] ?? task.qaAnswers[key] ?? `{{${key}}}`;
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
